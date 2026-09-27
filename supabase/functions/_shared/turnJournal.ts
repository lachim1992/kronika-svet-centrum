import { planFiscalWrites } from './atomicWrites.ts';
/** Completed phases are durable; retries never rerun physical progress or a settled goods snapshot. */
export function turnJournal(client: any, session: string, turn: number, token: string) {
  const journal = {
    async read(phase: string) {
      const {data,error}=await client.from('turn_phase_journal').select('result')
        .eq('session_id',session).eq('turn_number',turn).eq('phase',phase).maybeSingle();
      if(error)throw error;
      return data?.result ?? null;
    },
    async complete(phase: string, result: any) {
      const {error}=await client.rpc('complete_turn_phase',{p_session:session,p_turn:turn,p_token:token,p_phase:phase,p_result:result});
      if(error)throw error;
    },
    async atomic<T>(phase: string, compute: (db: any) => Promise<T>): Promise<T> {
      const prior = await journal.read(phase);
      if(prior!==null)return prior;
      const plan=planFiscalWrites(client);
      const result=await compute(plan.client);
      const {data,error}=await client.rpc('apply_atomic_turn_phase',{
        p_session:session,p_turn:turn,p_token:token,p_phase:phase,p_result:result,p_writes:plan.writes,
      });
      if(error)throw error;
      return data;
    },
  };
  return journal;
}
