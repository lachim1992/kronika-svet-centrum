export interface PlannedWrite {
  table: string; action: 'update' | 'insert' | 'upsert' | 'delete';
  values?: any; filters: { column: string; op: string; value: any }[]; conflict?: string;
}

/** Buffer a projection; the database applies its writes and guard in one transaction.
 * Reads overlay planned updates (e.g. two projects improving the same node).
 * Inserted rows are not queried by these planners. This is not a general transaction client.
 */
export function planFiscalWrites(client: any) {
  const writes: PlannedWrite[] = [];
  const overlay = (table: string, row: any, filters: PlannedWrite['filters']) => {
    if(!row || typeof row!=='object')return row;
    const known=Object.fromEntries(filters.filter(f=>f.op==='eq').map(f=>[f.column,f.value]));
    let projected={...row};
    for(const w of writes.filter(w=>w.table===table && w.action==='update')) {
      const values={...known,...projected};
      const matches=w.filters.every(f=>{
        if(!(f.column in values))return false;
        const v=values[f.column];
        if(f.op==='eq'||f.op==='is')return v===f.value;
        if(f.op==='neq')return v!==null&&v!==f.value;
        if(f.op==='in')return f.value.includes(v);
        if(f.op==='lt')return v<f.value;
        if(f.op==='lte')return v<=f.value;
        if(f.op==='gt')return v>f.value;
        if(f.op==='gte')return v>=f.value;
        return false;
      });
      if(matches)projected={...projected,...w.values};
    }
    return projected;
  };
  const readQuery=(query:any,table:string,filters:PlannedWrite['filters']=[]):any=>new Proxy(query,{get(target,key){
    if(key==='then')return (resolve:any,reject:any)=>Promise.resolve(target).then((r:any)=>{
      if(r.error)throw r.error;
      return {...r,data:Array.isArray(r.data)?r.data.map((row:any)=>overlay(table,row,filters)):overlay(table,r.data,filters)};
    }).then(resolve,reject);
    const value=target[key];
    if(typeof value!=='function')return value;
    return (...args:any[])=>{
      const next=value.apply(target,args);
      const fs=['eq','neq','in','is','lt','lte','gt','gte'].includes(String(key))
        ? [...filters,{column:args[0],op:String(key),value:args[1]}] : filters;
      return next&&typeof next.then==='function'?readQuery(next,table,fs):next;
    };
  }});
  const wrapped = new Proxy(client, { get(target, property) {
    if (property !== 'from') { const value = target[property]; return typeof value === 'function' ? value.bind(target) : value; }
    return (table: string) => {
      const original = target.from(table);
      return new Proxy(original, { get(query, method) {
        if (!['update', 'insert', 'upsert', 'delete'].includes(String(method))) {
          const value = query[method]; return typeof value === 'function' ? (...args:any[])=>{
            const next=value.apply(query,args);
            return next&&typeof next.then==='function'?readQuery(next,table):next;
          } : value;
        }
        return (values?: any, options?: any) => {
          const write: PlannedWrite = { table, action: method as PlannedWrite['action'], values, filters: [], conflict: options?.onConflict };
          let selection: string | undefined;
          let pending: Promise<any> | undefined;
          const chain: any = new Proxy({}, { get(_, key) {
            if (key === 'then') return (resolve: any, reject: any) => {
              pending ??= (async () => {
                let data: any = null;
                if (selection !== undefined) {
                  if (write.action !== 'update') throw new Error('Fiscal plan only supports returning rows for updates');
                  let read = target.from(table).select('*');
                  for (const f of write.filters) read = read[f.op](f.column, f.value);
                  const result = await read;
                  if (result.error) throw result.error;
                  data = (result.data || []).map((row: any) => ({ ...overlay(table,row,write.filters), ...values }));
                }
                writes.push(write);
                return { data, error: null };
              })();
              return pending.then(resolve, reject);
            };
            if (key === 'select') return (columns = '*') => { selection = columns; return chain; };
            if (['eq', 'neq', 'in', 'is', 'lt', 'lte', 'gt', 'gte'].includes(String(key))) return (column: string, value: any) => {
              write.filters.push({ column, op: String(key), value }); return chain;
            };
            throw new Error(`Unsupported fiscal mutation operator ${String(key)}`);
          }});
          return chain;
        };
      }});
    };
  }});
  return { client: wrapped, writes };
}
