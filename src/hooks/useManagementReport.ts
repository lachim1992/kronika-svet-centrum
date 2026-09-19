import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import type {ManagementReport} from '../../supabase/functions/_shared/management';

/** Reports are written when a turn is closed, so the current turn has none until it is resolved. */
const LOOKBACK_TURNS=4;

export type ManagementReportResult={report:ManagementReport|null;reportTurn:number|null};

/** Exact-turn read with fallback to the last closed turn. No refresh, tax collection or history writes. */
export function useManagementReport(sessionId:string,playerName:string,currentTurn:number){
  return useQuery<ManagementReportResult>({queryKey:['management',sessionId,playerName,currentTurn],enabled:!!sessionId&&!!playerName,
    staleTime:15_000,queryFn:async()=>{
      for(let turn=currentTurn;turn>currentTurn-LOOKBACK_TURNS&&turn>0;turn--){
        const {data,error}=await (supabase as any).rpc('read_economy_management',{p_session:sessionId,p_player:playerName,p_turn:turn});
        if(error)throw error;
        if(data)return {report:data as ManagementReport,reportTurn:turn};
      }
      return {report:null,reportTurn:null};
    }});
}
