import { registerVerifyAndLogin } from './identity-helper.mjs';

const baseUrl=process.env.API_URL??'http://127.0.0.1:5084';
const suffix=crypto.randomUUID().replaceAll('-','').slice(0,10);
async function request(path,init={}){const response=await fetch(`${baseUrl}${path}`,{...init,headers:{'content-type':'application/json',...(init.headers??{})}});const body=response.status===204?null:await response.json().catch(()=>null);if(!response.ok)throw new Error(`${init.method??'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);return body;}

const username=`content${suffix}`;
const {login}=await registerVerifyAndLogin(request,username,'content-e2e');
const headers={authorization:`Bearer ${login.tokens.accessToken}`};
const post=await request('/api/v1/content/',{method:'POST',headers,body:JSON.stringify({text:`Açıklanabilir etkileşim ${suffix} #mimari`,mediaIds:[],visibility:'Public',shareKind:'Original',originalPostId:null,linkUrl:null,contentWarning:null,isSensitive:false,isDraft:false,publishAtUtc:null})});
const poll=await request(`/api/v1/content/${post.id}/poll`,{method:'POST',headers,body:JSON.stringify({question:'İlk hangi konuyu ele alalım?',options:['Mimari','Güvenlik'],allowMultiple:false,closesAtUtc:new Date(Date.now()+3600000).toISOString()})});
const voted=await request(`/api/v1/content/${post.id}/poll/votes`,{method:'POST',headers,body:JSON.stringify({optionIds:[poll.options[0].id]})});
const viewSession=crypto.randomUUID();
const firstView=await request(`/api/v1/content/${post.id}/impressions`,{method:'POST',headers:{...headers,'X-View-Session':viewSession}});
const duplicateView=await request(`/api/v1/content/${post.id}/impressions`,{method:'POST',headers:{...headers,'X-View-Session':viewSession}});
await request(`/api/v1/content/${post.id}/saved`,{method:'PUT',headers,body:JSON.stringify({collection:'Mimari'})});
const saved=await request('/api/v1/content/saved?collection=Mimari&limit=10',{headers});
await request(`/api/v1/content/${post.id}/saved?collection=Mimari`,{method:'DELETE',headers});
const afterRemoval=await request('/api/v1/content/saved?collection=Mimari&limit=10',{headers});
const result={postId:post.id,pollCreated:poll.postId===post.id,voteCount:voted.totalVotes,firstViewCounted:firstView.counted,duplicateSuppressed:!duplicateView.counted,viewCountStable:firstView.viewCount===duplicateView.viewCount,savedVisible:saved.items.some(x=>x.content.id===post.id),removed:!afterRemoval.items.some(x=>x.content.id===post.id)};
if(!result.pollCreated||result.voteCount!==1||!result.firstViewCounted||!result.duplicateSuppressed||!result.viewCountStable||!result.savedVisible||!result.removed)throw new Error(`Content engagement E2E failed: ${JSON.stringify(result)}`);
console.log(JSON.stringify(result));
