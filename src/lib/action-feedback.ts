import { message } from './schemas';
export type ActionFeedback = { busy:boolean; error:string; notice:string };
export const emptyActionFeedback: ActionFeedback = { busy:false,error:'',notice:'' };

export function createActionRunner(publish: (state:ActionFeedback) => void) {
  let running = false;
  return async (operation: () => Promise<unknown>,success: string) => {
    if (running) return false;
    running = true; publish({ busy:true,error:'',notice:'' });
    try { await operation(); publish({ busy:false,error:'',notice:success }); return true; }
    catch (error) { publish({ busy:false,error:message(error),notice:'' }); return false; }
    finally { running = false; }
  };
}
