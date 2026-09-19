/** Supabase resolves query errors as values. Mandatory projections must reject them.
 * Preserve the query API and successful result; only the async boundary changes.
 * Use only for mandatory projection work, not best-effort notifications.
 */
export function strictDatabase<T extends object>(client:T):T {
  const wrap=(query:any):any=>new Proxy(query,{
    get(target,property){
      if(property==='then')return (resolve:any,reject:any)=>Promise.resolve(target).then((result:any)=>{
        if(result?.error)throw new Error(result.error.message||String(result.error));
        return result;
      }).then(resolve,reject);
      const value=Reflect.get(target,property,target);
      return typeof value==='function'?(...args:any[])=>{
        const next=value.apply(target,args);
        return next&&typeof next==='object'&&typeof next.then==='function'?wrap(next):next;
      }:value;
    }
  });
  return new Proxy(client,{get(target,property){const value:any=Reflect.get(target,property,target);
    if(property==='from'||property==='rpc')return (...args:any[])=>wrap(value.apply(target,args));
    return typeof value==='function'?value.bind(target):value;
  }});
}
