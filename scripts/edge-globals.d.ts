declare const Deno: {env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Response|Promise<Response>):void};
declare const EdgeRuntime: {waitUntil(promise:Promise<unknown>):void};
declare module 'npm:*' {export function createClient(...args:any[]):any;}
declare module 'https://esm.sh/*' {export function createClient(...args:any[]):any;export type SupabaseClient=any;}
