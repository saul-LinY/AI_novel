// Deterministic UI fixture. Uses the real HTTP/save engine in a temporary directory.
import { ending, proposal, rejectedProposal } from '../helpers.js';
export function makeFrontendRuntime() {
  const controls = { calls: [], releases: {}, failures: new Set(), scene: 0 };
  const scenes = ['tokyo-street', 'sky-observatory', 'red-well', 'genji-command', 'rendezvous', 'cassell-safehouse', 'theme-hotel'];
  class Runtime {
    constructor({ storyPackage }) { this.storyPackage=storyPackage; controls.runtime=this; }
    async initialize() {}
    dispose() { this.rejectWaiting?.(new Error('disposed')); }
    async abort() { if(!this.rejectWaiting)return false;this.rejectWaiting(new Error('cancelled'));this.rejectWaiting=null;return true; }
    async generateTurn(context, handlers) {
      controls.calls.push({action:context.action,trustedChoice:context.trustedChoice});
      handlers.onPhase('analyzing');
      for(const role of ['plot','character','environment'])handlers.onProgress?.({role,status:'started'});
      if(context.action==='等待取消')await new Promise((resolve,reject)=>{this.rejectWaiting=reject;});
      if(context.action==='失败一次' && !controls.failures.has('failure')) {controls.failures.add('failure');throw new Error('测试：生成服务暂不可用');}
      if(context.action==='不可执行')return {rejected:true,proposal:rejectedProposal(),reports:{},piEntryIds:{}};
      for(const role of ['environment','character','plot'])handlers.onProgress?.({role,status:'done'});
      handlers.onBeat?.({role:'environment',text:'窗外的雨声忽然密了，玻璃上爬满细碎的水痕。'});
      handlers.onBeat?.({role:'character',text:'绘梨衣握紧了笔记本，抬头看你。'});
      if(context.action==='等待准备')await new Promise(resolve=>{controls.releases.prepare=resolve;});
      handlers.onPhase('synthesizing');handlers.onProgress?.({role:'main',status:'started'});
      const locationId=scenes[controls.scene++%scenes.length];
      const location=this.storyPackage.locations.find(x=>x.id===locationId);
      const visual=location.states[0];
      const resultProposal=proposal({delta:{timeAdvanceMinutes:5,locationId:location.id,sceneStateId:visual.id},...(context.action==='正式收尾'?{choices:[],ending:ending('early'),storyProgress:{failCurrentStage:true,evidence:'人物承担了提前退出的代价，这次旅程至此结束。'}}:{})});
      const first='你来到'+location.name+'，在门边停下脚步。身旁的人把折好的纸递过来，指向通道尽头尚未熄灭的灯。';
      const long='你顺着纸上的记号看去，远处偶尔传来车轮压过积水的声音。窗玻璃映出你们并肩站着的影子，门外的脚步声渐渐远去。你把纸折好，示意同伴留意身后的动静，然后侧身让开一条路。现在每一个细小的发现都可能影响接下来的选择，但你知道，眼下最重要的是把已经知道的事情分清楚。';
      const tail='你们沿着亮着灯的一侧往前走，门在身后缓缓合拢。新的路就在前方。';
      const prefix=first+'\n\n'+Array.from({length:8},()=>long).join('\n\n');
      const prepared={scene:{locationId:location.id,locationName:location.name,stateId:visual.id,title:visual.title,image:visual.image,fallbackImage:location.fallbackImage}, fixtureProposal:resultProposal, fixtureTail:tail};
      handlers.onProgress?.({role:'main',status:'done'});
      await handlers.onPrepared(prepared);handlers.onOutcome?.({outcomeType:'success_with_cost',label:'得偿所愿，代价随行',ending:false});handlers.onPhase('narrating');handlers.onSentence(prefix);
      if(context.action==='等待恢复' && !controls.failures.has('resume')) {controls.failures.add('resume');throw new Error('测试：连接暂时中断');}
      if(context.action==='等待续写')await new Promise(resolve=>{controls.releases.stream=resolve;});
      handlers.onSentence('\n\n'+tail);
      if(context.action==='等待续写')await new Promise(resolve=>{controls.releases.commit=resolve;});
      return {rejected:false,proposal:resultProposal,prose:prefix+'\n\n'+tail,reports:{},piEntryIds:{}};
    }
    async resumePreparedTurn(context, prepared, handlers) {
      handlers.onPhase('recovering');
      const suffix='\n\n'+prepared.fixtureTail;
      handlers.onSentence(suffix);
      return {rejected:false,proposal:prepared.fixtureProposal,prose:prepared.prosePrefix+suffix,reports:{},piEntryIds:{}};
    }
  }
  return { controls, runtimeFactory: args => new Runtime(args) };
}
