import {createClient} from 'npm:@supabase/supabase-js@2';
import {previewEconomy} from '../_shared/economyPreview.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Content-Type':'application/json'};
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{headers});
  try{
    const authorization=request.headers.get('Authorization');
    if(!authorization)return Response.json({error:'Authentication required'},{status:401,headers});
    const url=Deno.env.get('SUPABASE_URL')!;
    const userClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}});
    const {data:user,error:authError}=await userClient.auth.getUser();
    if(authError||!user.user)return Response.json({error:'Authentication required'},{status:401,headers});
    const {sessionId,playerName,turn,scenario}=await request.json();
    const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {data:member,error:memberError}=await db.from('game_players').select('id').eq('session_id',sessionId).eq('user_id',user.user.id).eq('player_name',playerName).maybeSingle();
    if(memberError)throw memberError;
    if(!member)return Response.json({error:'Realm access denied'},{status:403,headers});
    const [ledger,realm,session]=await Promise.all([
      db.from('economy_turn_ledgers').select('result').eq('session_id',sessionId).eq('turn_number',turn).maybeSingle(),
      db.from('realm_resources').select('*').eq('session_id',sessionId).eq('player_name',playerName).single(),
      db.from('game_sessions').select('current_turn').eq('id',sessionId).single(),
    ]);
    for(const result of [ledger,realm,session])if(result.error)throw result.error;
    if(session.data.current_turn!==turn||!ledger.data?.result?.snapshot)return Response.json({error:'Current economy snapshot unavailable'},{status:409,headers});
    return Response.json({ok:true,...previewEconomy(ledger.data.result.snapshot,realm.data,scenario)},{headers});
  }catch(error){return Response.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:400,headers});}
});
