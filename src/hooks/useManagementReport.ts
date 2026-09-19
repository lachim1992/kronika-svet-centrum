import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import type {ManagementReport} from '../../supabase/functions/_shared/management';

/** Exact-turn read. No refresh, tax collection, turn resolution or history writes. */
export function useManagementReport(sessionId:string,playerName:string,currentTurn:number){
  return useQuery({queryKey:['management',sessionId,playerName,currentTurn],enabled:!!sessionId&&!!playerName,
    staleTime:15_000,queryFn:async()=>{
      const {data,error}=await (supabase as any).rpc('read_economy_management',{p_session:sessionId,p_player:playerName,p_turn:currentTurn});
      if(error)throw error;
      return data as ManagementReport|null;
    }});
}
