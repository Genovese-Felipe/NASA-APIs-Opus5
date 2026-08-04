(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))o(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const s of r.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&o(s)}).observe(document,{childList:!0,subtree:!0});function a(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function o(i){if(i.ep)return;i.ep=!0;const r=a(i);fetch(i.href,r)}})();const re={low:{id:"low",renderScale:.58,maxPixelRatio:1,starLayers:1,bloom:.25,targetFps:60},balanced:{id:"balanced",renderScale:.82,maxPixelRatio:1.5,starLayers:2,bloom:.45,targetFps:60},high:{id:"high",renderScale:1,maxPixelRatio:2,starLayers:3,bloom:.72,targetFps:90},ultra:{id:"ultra",renderScale:1.18,maxPixelRatio:2.5,starLayers:4,bloom:.95,targetFps:120}},De=[{id:"apod",name:"Astronomy Picture of the Day",agency:"NASA",module:"orbit",status:"live",browserPolicy:"keyed-cors",description:"Daily astronomy media and an expert-written explanation.",docs:"https://api.nasa.gov/"},{id:"neows",name:"Asteroids NeoWs",agency:"NASA/JPL",module:"neo",status:"live",browserPolicy:"keyed-cors",description:"Near-Earth object discovery, close-approach, velocity, size, and hazard metadata.",docs:"https://api.nasa.gov/"},{id:"donki",name:"DONKI Space Weather",agency:"NASA/GSFC",module:"helio",status:"live",browserPolicy:"keyed-cors",description:"Coronal mass ejections, solar flares, and linked space-weather analyses.",docs:"https://api.nasa.gov/"},{id:"epic",name:"DSCOVR EPIC",agency:"NASA/NOAA",module:"earth",status:"live",browserPolicy:"keyed-cors",description:"Full-disc Earth imagery and observation geometry from the L1 point.",docs:"https://epic.gsfc.nasa.gov/about/api"},{id:"eonet",name:"EONET v3",agency:"NASA/GSFC",module:"earth",status:"live",browserPolicy:"cors",description:"Curated natural-event metadata with categories, sources, time, and GeoJSON geometry.",docs:"https://eonet.gsfc.nasa.gov/docs/v3"},{id:"images",name:"NASA Image and Video Library",agency:"NASA",module:"archive",status:"live",browserPolicy:"cors",description:"Searchable image, video, and audio records with source metadata and asset manifests.",docs:"https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf"},{id:"gibs",name:"Global Imagery Browse Services",agency:"NASA EOSDIS",module:"earth",status:"live",browserPolicy:"cors",description:"Standards-based global satellite imagery layers for Earth science.",docs:"https://nasa-gibs.github.io/gibs-api-docs/"},{id:"exoplanet",name:"NASA Exoplanet Archive TAP",agency:"NASA/IPAC",module:"catalog",status:"live",browserPolicy:"deep-link-only",description:"Confirmed planets, host stars, candidates, and derived planetary-system parameters.",docs:"https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html"},{id:"techtransfer",name:"NASA Technology Transfer",agency:"NASA",module:"catalog",status:"live",browserPolicy:"keyed-cors",description:"Patents, software, and technologies available for licensing.",docs:"https://api.nasa.gov/"},{id:"tle",name:"NASA Two-Line Elements",agency:"NASA",module:"orbit",status:"live",browserPolicy:"keyed-cors",description:"Orbital element sets for tracked spacecraft and objects.",docs:"https://api.nasa.gov/"},{id:"jpl-ssd",name:"JPL SSD/CNEOS API Service",agency:"NASA/JPL",module:"catalog",status:"reference-only",browserPolicy:"deep-link-only",description:"Horizons, SBDB, Sentry, Scout, fireballs, close approaches, and other specialist services. Official policy prohibits embedding these endpoints in a website.",docs:"https://ssd-api.jpl.nasa.gov/"},{id:"mars-rover",name:"Mars Rover Photos",agency:"NASA/JPL",module:"archive",status:"archived",browserPolicy:"deep-link-only",description:"Legacy Mars rover photo endpoint; the NASA API portal marks it archived.",docs:"https://api.nasa.gov/"},{id:"insight",name:"InSight Mars Weather",agency:"NASA/JPL",module:"archive",status:"archived",browserPolicy:"deep-link-only",description:"Historical weather observations from the completed InSight mission.",docs:"https://api.nasa.gov/"}],Pe={orbit:[.15,.78,1],earth:[.1,.88,.72],neo:[1,.42,.16],helio:[1,.16,.42],archive:[.67,.36,1]};function Y(t){if(typeof window>"u")return null;try{return t==="local"?window.localStorage:window.sessionStorage}catch{return null}}function z(t,e){try{return Y(t)?.getItem(e)??null}catch{return null}}function U(t,e,a){try{const o=Y(t);return o?(o.setItem(e,a),!0):!1}catch{return!1}}function ke(t,e){try{const a=Y(t);return a?(a.removeItem(e),!0):!1}catch{return!1}}const R="https://api.nasa.gov",Ce="https://eonet.gsfc.nasa.gov/api/v3",Ne="https://images-api.nasa.gov",se="opus5-api-v1:",Re=14e3;function g(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function u(t,e=""){return typeof t=="string"?t:e}function E(t,e=0){const a=typeof t=="number"?t:Number(t);return Number.isFinite(a)?a:e}function A(t){return Array.isArray(t)?t:[]}function M(){return new Date().toISOString().slice(0,10)}function Me(t){return new Date(Date.now()-t*864e5).toISOString().slice(0,10)}function ne(){try{return typeof localStorage>"u"?null:localStorage}catch{return null}}class Te{constructor(e=3){this.concurrency=e}concurrency;active=0;queue=[];async get(e,a,o,i=!1){const r=ne(),s=`${se}${a}`,n=this.readCache(r,s);if(!i&&n&&Date.now()-n.storedAt<o)return{data:n.data,mode:"cache"};try{const l=await this.schedule(async()=>{const p=new AbortController,v=window.setTimeout(()=>p.abort(),Re);try{const x=await fetch(e,{signal:p.signal,headers:{Accept:"application/json"},referrerPolicy:"strict-origin-when-cross-origin"});if(!x.ok)throw new Error(`HTTP ${x.status}`);return await x.json()}finally{window.clearTimeout(v)}});try{r?.setItem(s,JSON.stringify({storedAt:Date.now(),data:l}))}catch{}return{data:l,mode:"live"}}catch(l){if(n)return{data:n.data,mode:"cache"};throw l}}clear(){const e=ne();if(e)for(let a=e.length-1;a>=0;a-=1){const o=e.key(a);o?.startsWith(se)&&e.removeItem(o)}}readCache(e,a){try{const o=e?.getItem(a);if(!o)return null;const i=JSON.parse(o);return!i||typeof i.storedAt!="number"||!("data"in i)?null:i}catch{return null}}schedule(e){return new Promise((a,o)=>{const i=()=>{this.active+=1,e().then(a,o).finally(()=>{this.active-=1,this.pump()})};this.queue.push(i),this.pump()})}pump(){for(;this.active<this.concurrency&&this.queue.length;)this.queue.shift()?.()}}function Oe(t){if(!g(t)||!u(t.title)||!u(t.date))throw new Error("Invalid APOD payload");const e=u(t.media_type);return{title:u(t.title),explanation:u(t.explanation,"No explanation supplied."),date:u(t.date),mediaType:e==="image"||e==="video"?e:"other",url:u(t.url),hdUrl:u(t.hdurl)||void 0,thumbnailUrl:u(t.thumbnail_url)||void 0,copyright:u(t.copyright)||void 0}}function Le(t){if(!g(t)||!g(t.near_earth_objects))throw new Error("Invalid NeoWs payload");return Object.values(t.near_earth_objects).flatMap(A).slice(0,36).map((a,o)=>{if(!g(a))throw new Error("Invalid NeoWs object");const i=g(a.estimated_diameter)&&g(a.estimated_diameter.kilometers)?a.estimated_diameter.kilometers:{},r=A(a.close_approach_data),s=g(r[0])?r[0]:{},n=g(s.relative_velocity)?s.relative_velocity:{},l=g(s.miss_distance)?s.miss_distance:{},p=E(i.estimated_diameter_min),v=E(i.estimated_diameter_max);return{id:u(a.id,`neo-${o}`),name:u(a.name,`Object ${o+1}`),diameterKm:(p+v)/2,velocityKps:E(n.kilometers_per_second),missDistanceKm:E(l.kilometers),hazardous:a.is_potentially_hazardous_asteroid===!0,nasaUrl:g(a.nasa_jpl_url)?"":u(a.nasa_jpl_url)}})}function _e(t){if(!g(t)||!Array.isArray(t.events))throw new Error("Invalid EONET payload");return t.events.slice(0,24).flatMap((e,a)=>{if(!g(e))return[];const i=[...A(e.geometry)].reverse().find(v=>g(v)&&g(v.geometry));if(!g(i)||!g(i.geometry))return[];const r=A(i.geometry.coordinates);if(u(i.geometry.type)!=="Point"||r.length<2)return[];const s=A(e.categories),n=g(s[0])?u(s[0].title,"Event"):"Event",l=A(e.sources),p=g(l[0])?u(l[0].url):"";return[{id:u(e.id,`event-${a}`),title:u(e.title,"Earth event"),category:n,longitude:E(r[0]),latitude:E(r[1]),date:u(i.date),sourceUrl:p||void 0}]})}function Ie(t,e){const a=[];for(const[o,i]of A(t).entries()){if(!g(i))continue;const r=A(i.cmeAnalyses),s=g(r[0])?r[0]:{};a.push({id:u(i.activityID,`cme-${o}`),type:"CME",startTime:u(i.startTime),speedKps:E(s.speed)||void 0,sourceUrl:u(i.link)||void 0})}for(const[o,i]of A(e).entries())g(i)&&a.push({id:u(i.flrID,`flare-${o}`),type:"FLR",startTime:u(i.beginTime),classType:u(i.classType)||void 0,sourceUrl:u(i.link)||void 0});return a.sort((o,i)=>i.startTime.localeCompare(o.startTime)).slice(0,30)}function ze(t,e){return A(t).slice(0,12).flatMap(a=>{if(!g(a)||!u(a.image)||!u(a.date))return[];const o=u(a.date),i=o.slice(0,10).replaceAll("-","/"),r=g(a.centroid_coordinates)?a.centroid_coordinates:{};return[{identifier:u(a.identifier,u(a.image)),caption:u(a.caption,"DSCOVR EPIC Earth observation"),date:o,imageUrl:`${R}/EPIC/archive/natural/${i}/png/${encodeURIComponent(u(a.image))}.png?api_key=${encodeURIComponent(e)}`,centroid:{lat:E(r.lat),lon:E(r.lon)}}]})}function Ue(t){if(!g(t)||!g(t.collection)||!Array.isArray(t.collection.items))throw new Error("Invalid NASA Images payload");return t.collection.items.slice(0,24).flatMap(e=>{if(!g(e))return[];const a=A(e.data),o=g(a[0])?a[0]:{},r=A(e.links).find(s=>g(s)&&u(s.rel)==="preview");return!g(r)||!u(r.href)?[]:[{nasaId:u(o.nasa_id),title:u(o.title,"Untitled NASA asset"),description:u(o.description_508,u(o.description)).slice(0,600),date:u(o.date_created),center:u(o.center,"NASA"),previewUrl:u(r.href),mediaType:u(o.media_type,"image")}]})}function y(t,e,a,o){return{data:t,mode:e,source:a,fetchedAt:new Date().toISOString(),sourceTimestamp:o}}const _={apod:{title:"Live astronomy signal pending",explanation:"A deterministic demonstration scene is active while the live APOD endpoint is unavailable. No current NASA observation is being claimed.",date:M(),mediaType:"other",url:""},neo:Array.from({length:14},(t,e)=>({id:`demo-${e}`,name:`Demonstration object ${String.fromCharCode(65+e)}`,diameterKm:.08+e*37%80/100,velocityKps:8+e*19%31,missDistanceKm:9e5+e*54e4,hazardous:e%6===0,nasaUrl:""})),earth:[{id:"demo-wildfire",title:"Demonstration wildfire signal",category:"Wildfires",longitude:-54.5,latitude:-12.2,date:M()},{id:"demo-storm",title:"Demonstration storm signal",category:"Severe Storms",longitude:139.2,latitude:24.5,date:M()},{id:"demo-volcano",title:"Demonstration volcano signal",category:"Volcanoes",longitude:110.4,latitude:-7.5,date:M()}],solar:[{id:"demo-flare",type:"FLR",startTime:new Date().toISOString(),classType:"DEMO"},{id:"demo-cme",type:"CME",startTime:new Date(Date.now()-72e5).toISOString(),speedKps:520}]};class Ke extends EventTarget{broker=new Te(3);apiKey=z("session","opus5-nasa-key")||"DEMO_KEY";statuses=new Map;get keyIsDemo(){return this.apiKey==="DEMO_KEY"}setApiKey(e){const a=e.trim()||"DEMO_KEY";this.apiKey=a,a==="DEMO_KEY"?ke("session","opus5-nasa-key"):U("session","opus5-nasa-key",a),this.broker.clear()}getStatuses(){return[...this.statuses.values()]}async loadApod(e=!1){return this.guard("apod",async()=>{const a=await this.broker.get(`${R}/planetary/apod?api_key=${encodeURIComponent(this.apiKey)}&thumbs=true`,"apod",36e5,e),o=Oe(a.data);return y(o,a.mode,"NASA APOD",o.date)},()=>y(_.apod,"demo","Built-in demonstration"))}async loadNeo(e=!1){return this.guard("neows",async()=>{const a=M(),o=`${R}/neo/rest/v1/feed?start_date=${a}&end_date=${a}&api_key=${encodeURIComponent(this.apiKey)}`,i=await this.broker.get(o,`neo-${a}`,18e5,e);return y(Le(i.data),i.mode,"NASA/JPL NeoWs",a)},()=>y(_.neo,"demo","Built-in demonstration"))}async loadEarth(e=!1){const[a,o]=await Promise.all([this.guard("eonet",async()=>{const i=await this.broker.get(`${Ce}/events?status=open&limit=24&days=60`,"eonet-open",18e5,e);return y(_e(i.data),i.mode,"NASA EONET v3")},()=>y(_.earth,"demo","Built-in demonstration")),this.guard("epic",async()=>{const i=await this.broker.get(`${R}/EPIC/api/natural?api_key=${encodeURIComponent(this.apiKey)}`,"epic-natural",36e5,e),r=ze(i.data,this.apiKey);if(!r.length)throw new Error("EPIC returned no frames");return y(r,i.mode,"NASA DSCOVR EPIC",r[0]?.date)},()=>y([],"demo","Built-in demonstration"))]);return{events:a,epic:o}}async loadSolar(e=!1){return this.guard("donki",async()=>{const a=Me(30),o=M(),i=`${R}/DONKI/CME?startDate=${a}&endDate=${o}&api_key=${encodeURIComponent(this.apiKey)}`,r=`${R}/DONKI/FLR?startDate=${a}&endDate=${o}&api_key=${encodeURIComponent(this.apiKey)}`,s=await this.broker.get(i,`donki-cme-${o}`,18e5,e),n=await this.broker.get(r,`donki-flr-${o}`,18e5,e),l=s.mode==="live"||n.mode==="live"?"live":"cache";return y(Ie(s.data,n.data),l,"NASA DONKI",`${a} / ${o}`)},()=>y(_.solar,"demo","Built-in demonstration"))}async searchArchive(e,a=!1){const o=e.trim().slice(0,120)||"James Webb Space Telescope";return this.guard("images",async()=>{const i=`${Ne}/search?q=${encodeURIComponent(o)}&media_type=image&page_size=24`,r=await this.broker.get(i,`images-${o.toLowerCase()}`,864e5,a);return y(Ue(r.data),r.mode,"NASA Image and Video Library")},()=>y([],"demo","Built-in demonstration"))}async guard(e,a,o){this.setStatus(e,"loading");try{const i=await a();return this.setStatus(e,i.mode),i}catch(i){const r=i instanceof Error?i.message:"Unknown error";return this.setStatus(e,"demo",r),o()}}setStatus(e,a,o){const i={id:e,status:a,message:o,updatedAt:new Date().toISOString()};this.statuses.set(e,i),this.dispatchEvent(new CustomEvent("status",{detail:i}))}}const G={orbit:[55,82.5],earth:[64,96],neo:[48,144],helio:[72,216],archive:[44,132]};class Fe{context=null;master=null;filter=null;oscillators=[];recordingDestination=null;enabled=!1;scene="orbit";energy=.3;get isEnabled(){return this.enabled}async setEnabled(e){e?(await this.ensureGraph(),await this.context?.resume(),this.enabled=!0,this.master?.gain.setTargetAtTime(.13,this.context?.currentTime??0,.22)):(this.enabled=!1,this.master?.gain.setTargetAtTime(1e-4,this.context?.currentTime??0,.16))}setScene(e){this.scene=e,this.retune()}setEnergy(e){this.energy=Math.max(0,Math.min(1,e)),!(!this.context||!this.filter)&&(this.filter.frequency.setTargetAtTime(280+this.energy*1250,this.context.currentTime,.35),this.filter.Q.setTargetAtTime(.6+this.energy*3.4,this.context.currentTime,.4))}pulse(e=.5){if(!this.enabled||!this.context||!this.master)return;const a=this.context.currentTime,o=this.context.createOscillator(),i=this.context.createGain();o.type="sine",o.frequency.setValueAtTime(G[this.scene][1]*(1+e),a),o.frequency.exponentialRampToValueAtTime(G[this.scene][0],a+.55),i.gain.setValueAtTime(1e-4,a),i.gain.exponentialRampToValueAtTime(.06,a+.018),i.gain.exponentialRampToValueAtTime(1e-4,a+.7),o.connect(i).connect(this.master),o.start(a),o.stop(a+.72)}getRecordingTrack(){return this.enabled?this.recordingDestination?.stream.getAudioTracks()[0]?.clone()??null:null}async ensureGraph(){if(this.context)return;this.context=new AudioContext({latencyHint:"interactive"}),this.master=this.context.createGain(),this.master.gain.value=1e-4,this.filter=this.context.createBiquadFilter(),this.filter.type="lowpass",this.filter.frequency.value=620,this.filter.Q.value=1.2,this.recordingDestination=this.context.createMediaStreamDestination(),this.filter.connect(this.master),this.master.connect(this.context.destination),this.master.connect(this.recordingDestination);const e=["sine","triangle","sine"],a=[-9,0,7];for(let p=0;p<3;p+=1){const v=this.context.createOscillator(),x=this.context.createGain();v.type=e[p]??"sine",v.detune.value=a[p]??0,x.gain.value=p===0?.58:.18,v.connect(x).connect(this.filter),v.start(),this.oscillators.push(v)}const o=this.context.sampleRate*3,i=this.context.createBuffer(1,o,this.context.sampleRate),r=i.getChannelData(0);let s=0;for(let p=0;p<r.length;p+=1){const v=Math.random()*2-1;s=s*.985+v*.015,r[p]=s*.16}const n=this.context.createBufferSource(),l=this.context.createGain();n.buffer=i,n.loop=!0,l.gain.value=.24,n.connect(l).connect(this.filter),n.start(),this.retune(),this.setEnergy(this.energy)}retune(){if(!this.context)return;const[e,a]=G[this.scene],o=[e,a,e*2.01];this.oscillators.forEach((i,r)=>{i.frequency.setTargetAtTime(o[r]??e,this.context.currentTime,.8)})}}const $e=["video/mp4;codecs=avc1.42E01E","video/mp4","video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"];function qe(t){return $e.find(t)||""}function He(t){return t.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,100)||"nasa-opus5"}function pe(t,e){const a=URL.createObjectURL(t),o=document.createElement("a");o.href=a,o.download=e,o.rel="noopener",document.body.append(o),o.click(),o.remove(),window.setTimeout(()=>URL.revokeObjectURL(a),1e4)}async function We(t,e,a){const o=`image/${e}`,i=await new Promise(r=>t.toBlob(r,o,a));if(!i)throw new Error(`The browser could not encode ${o}`);return i}function Be(t,e){const a=t*e,o=navigator.deviceMemory;return a>335e5||o&&o<=2&&a>9e6?!1:t>0&&e>0}class Ge{constructor(e){this.renderer=e}renderer;async export(e,a){if(!Be(e.width,e.height))throw new Error("EXPORT_CAPABILITY");const o=await this.renderer.renderExport(e.width,e.height,a),i=await We(o,e.format,e.quality);return pe(i,`${He(e.filename)}.${e.format==="jpeg"?"jpg":e.format}`),o.width=1,o.height=1,i}}class Ve extends EventTarget{recorder=null;chunks=[];startedAt=0;stopTimer=0;activeMime="";get isRecording(){return this.recorder?.state==="recording"}get elapsedSeconds(){return this.startedAt?(performance.now()-this.startedAt)/1e3:0}start(e,a,o=60,i=120){if(this.isRecording)throw new Error("Recording is already active");if(!("MediaRecorder"in window)||!e.captureStream)throw new Error("RECORDING_UNSUPPORTED");const r=e.captureStream(o),s=new MediaStream(r.getVideoTracks());a&&s.addTrack(a),this.activeMime=qe(l=>MediaRecorder.isTypeSupported(l));const n={videoBitsPerSecond:Math.max(8e6,Math.min(36e6,e.width*e.height*o*.12))};return this.activeMime&&(n.mimeType=this.activeMime),this.chunks=[],this.recorder=new MediaRecorder(s,n),this.recorder.addEventListener("dataavailable",l=>{l.data.size&&this.chunks.push(l.data)}),this.recorder.addEventListener("error",l=>this.dispatchEvent(new CustomEvent("error",{detail:l}))),this.recorder.start(1e3),this.startedAt=performance.now(),this.stopTimer=window.setTimeout(()=>{this.isRecording&&this.dispatchEvent(new Event("limit"))},i*1e3),this.activeMime||this.recorder.mimeType||"video/webm"}stop(){return!this.recorder||this.recorder.state==="inactive"?Promise.reject(new Error("No recording is active")):(window.clearTimeout(this.stopTimer),new Promise((e,a)=>{const o=this.recorder;o.addEventListener("stop",()=>{const i=this.activeMime||o.mimeType||"video/webm",r=i.startsWith("video/mp4")?"mp4":"webm",s=new Blob(this.chunks,{type:i});o.stream.getTracks().forEach(n=>n.stop()),this.recorder=null,this.startedAt=0,this.chunks=[],s.size?e({blob:s,extension:r,mimeType:i}):a(new Error("The recording contains no data"))},{once:!0}),o.stop()}))}}const je=`#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`,Ye=`#version 300 es
precision highp float;

out vec4 outColor;
uniform vec2 u_resolution;
uniform vec2 u_fullResolution;
uniform vec2 u_tileOrigin;
uniform float u_time;
uniform vec3 u_camera;
uniform int u_scene;
uniform int u_starLayers;
uniform float u_bloom;
uniform float u_exposure;
uniform vec3 u_accent;
uniform vec3 u_data;
uniform vec2 u_eventCoords[12];
uniform int u_eventCount;

#define PI 3.14159265359
#define TAU 6.28318530718
#define FAR 100000.0

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0,0,0));
  float n100 = hash31(i + vec3(1,0,0));
  float n010 = hash31(i + vec3(0,1,0));
  float n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1));
  float n101 = hash31(i + vec3(1,0,1));
  float n011 = hash31(i + vec3(0,1,1));
  float n111 = hash31(i + vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amp = 0.5;
  mat3 rot = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
  for (int i = 0; i < 5; i++) {
    value += amp * noise3(p);
    p = rot * p * 2.04 + 0.17;
    amp *= 0.5;
  }
  return value;
}

float raySphere(vec3 ro, vec3 rd, vec3 center, float radius) {
  vec3 oc = ro - center;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - radius * radius;
  float h = b * b - c;
  if (h < 0.0) return FAR;
  h = sqrt(h);
  float nearT = -b - h;
  float farT = -b + h;
  return nearT > 0.0 ? nearT : (farT > 0.0 ? farT : FAR);
}

float sphereGlow(vec3 ro, vec3 rd, vec3 center, float radius) {
  vec3 oc = center - ro;
  float t = max(dot(oc, rd), 0.0);
  float d = length(oc - rd * t);
  return radius / max(d, 0.001);
}

vec3 rotateY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
}

vec3 starField(vec3 rd) {
  vec3 color = vec3(0.0015, 0.003, 0.009);
  float band = pow(max(0.0, 1.0 - abs(dot(rd, normalize(vec3(0.18, 0.93, 0.32))))), 7.0);
  float dust = fbm(rd * 5.0 + vec3(1.0, 4.0, 2.0));
  color += band * mix(vec3(0.025,0.05,0.12), vec3(0.16,0.065,0.12), dust) * (0.5 + dust);
  for (int layer = 0; layer < 4; layer++) {
    if (layer >= u_starLayers) continue;
    float scale = 210.0 + float(layer) * 173.0;
    vec3 cell = floor(rd * scale);
    vec3 local = fract(rd * scale) - 0.5;
    vec3 seed = hash33(cell + float(layer) * 19.7) - 0.5;
    float d = length(local - seed * 0.72);
    float gate = step(0.992 - float(layer) * 0.0012, hash31(cell + 7.1));
    float star = gate * pow(max(0.0, 1.0 - d * 9.0), 12.0);
    float temperature = hash31(cell + 31.4);
    vec3 starColor = mix(vec3(0.48,0.65,1.0), vec3(1.0,0.56,0.28), temperature);
    color += starColor * star * (1.2 + float(layer) * 0.35);
  }
  return color;
}

vec3 planetSurface(vec3 n, bool earthLike) {
  vec3 p = rotateY(n, u_time * 0.035);
  float continents = fbm(p * 3.25 + vec3(2.1, 0.0, -1.7));
  float detail = fbm(p * 11.0 + 4.0);
  float clouds = smoothstep(0.61, 0.78, fbm(p * 6.8 + vec3(u_time * 0.014,0.0,0.0)));
  vec3 ocean = earthLike ? vec3(0.008,0.065,0.17) : vec3(0.055,0.018,0.13);
  vec3 landA = earthLike ? vec3(0.035,0.19,0.10) : vec3(0.28,0.075,0.025);
  vec3 landB = earthLike ? vec3(0.28,0.31,0.12) : vec3(0.42,0.22,0.065);
  float landMask = smoothstep(0.49, 0.57, continents + detail * 0.09);
  vec3 color = mix(ocean, mix(landA, landB, detail), landMask);
  float ice = smoothstep(0.72, 0.93, abs(n.y));
  color = mix(color, vec3(0.72,0.86,0.95), ice);
  color = mix(color, vec3(0.78,0.88,0.96), clouds * 0.52);
  return color;
}

vec3 geoVector(vec2 lonLat) {
  float lon = radians(lonLat.x);
  float lat = radians(lonLat.y);
  return normalize(vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon)));
}

float eventGlow(vec3 normal) {
  float glow = 0.0;
  vec3 spun = rotateY(normal, u_time * 0.035);
  for (int i = 0; i < 12; i++) {
    if (i >= u_eventCount) continue;
    float alignment = dot(spun, geoVector(u_eventCoords[i]));
    glow += pow(max(alignment, 0.0), 280.0) * (1.0 + 0.45 * sin(u_time * 4.0 + float(i)));
  }
  return glow;
}

vec3 shadeSphere(vec3 ro, vec3 rd, vec3 center, float radius, vec3 lightPos, bool earthLike, bool events) {
  float hit = raySphere(ro, rd, center, radius);
  if (hit >= FAR) return vec3(-1.0);
  vec3 p = ro + rd * hit;
  vec3 n = normalize(p - center);
  vec3 l = normalize(lightPos - p);
  float diffuse = max(dot(n, l), 0.0);
  float night = pow(max(dot(n, -l), 0.0), 1.6);
  float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.4);
  vec3 albedo = planetSurface(n, earthLike);
  vec3 color = albedo * (0.045 + diffuse * 1.18);
  color += earthLike ? vec3(0.015,0.09,0.16) * night : vec3(0.10,0.018,0.055) * night;
  color += (earthLike ? vec3(0.08,0.55,1.0) : u_accent) * rim * (0.22 + u_bloom * 0.38);
  if (events) color += vec3(1.0,0.22,0.055) * eventGlow(n) * 2.7;
  return color;
}

vec3 orbitRings(vec3 ro, vec3 rd, vec3 base, float intensity) {
  float denom = rd.y;
  if (abs(denom) < 0.001) return base;
  float t = -ro.y / denom;
  if (t <= 0.0) return base;
  vec3 p = ro + rd * t;
  float r = length(p.xz);
  float ring = 0.0;
  ring += exp(-420.0 * abs(r - 1.72));
  ring += exp(-380.0 * abs(r - 2.42)) * 0.6;
  ring += exp(-350.0 * abs(r - 3.15)) * 0.35;
  float fade = smoothstep(5.0, 0.5, length(p));
  return base + u_accent * ring * fade * intensity;
}

vec3 renderOrbit(vec3 ro, vec3 rd, vec3 background) {
  vec3 lightPos = vec3(-4.6, 2.5, -3.2);
  vec3 color = orbitRings(ro, rd, background, 0.28);
  float planetHit = raySphere(ro, rd, vec3(0), 1.0);
  float moonAngle = u_time * 0.17;
  vec3 moonPos = vec3(cos(moonAngle)*2.42, 0.18*sin(moonAngle*0.7), sin(moonAngle)*2.42);
  float moonHit = raySphere(ro, rd, moonPos, 0.18);
  float sunHit = raySphere(ro, rd, lightPos, 0.48);
  if (planetHit < moonHit && planetHit < sunHit) return shadeSphere(ro,rd,vec3(0),1.0,lightPos,false,false);
  if (moonHit < planetHit && moonHit < sunHit) {
    vec3 p = ro + rd * moonHit;
    vec3 n = normalize(p - moonPos);
    float craters = fbm(n * 10.0);
    float diffuse = max(dot(n, normalize(lightPos-p)), 0.0);
    return mix(vec3(0.09), vec3(0.42), craters) * (0.04 + diffuse);
  }
  if (sunHit < FAR) {
    vec3 p = ro + rd * sunHit;
    float plasma = fbm(normalize(p-lightPos)*8.0 + u_time*0.25);
    return mix(vec3(1.0,0.16,0.015), vec3(1.0,0.86,0.25), plasma) * 2.4;
  }
  float sunGlow = pow(clamp(sphereGlow(ro,rd,lightPos,0.48),0.0,1.0),4.0);
  return color + vec3(1.0,0.25,0.035)*sunGlow*u_bloom;
}

vec3 renderEarth(vec3 ro, vec3 rd, vec3 background) {
  vec3 lightPos = vec3(-4.0, 2.0, -2.5);
  float hit = raySphere(ro,rd,vec3(0),1.2);
  if (hit < FAR) return shadeSphere(ro,rd,vec3(0),1.2,lightPos,true,true);
  float atmosphere = sphereGlow(ro,rd,vec3(0),1.2);
  float halo = pow(clamp((atmosphere-0.72)/0.28,0.0,1.0),5.0);
  vec3 aurora = mix(vec3(0.04,0.55,1.0),vec3(0.08,1.0,0.55),0.5+0.5*sin(u_time*0.7));
  return background + aurora * halo * 0.34 * (0.7+u_bloom);
}

vec3 asteroidPosition(int index, float time) {
  float fi = float(index);
  float seed = hash11(fi * 17.13 + 2.7);
  float radius = 1.0 + seed * 2.5;
  float speed = 0.06 + hash11(fi*3.17)*0.18;
  float angle = fi * 2.39996 + time * speed;
  float inclination = (hash11(fi*9.1)-0.5) * 0.75;
  return vec3(cos(angle)*radius, sin(angle*1.73)*inclination, sin(angle)*radius);
}

vec3 renderNeo(vec3 ro, vec3 rd, vec3 background) {
  vec3 color = orbitRings(ro,rd,background,0.18);
  vec3 lightPos = vec3(-4.0,3.0,-3.0);
  float best = raySphere(ro,rd,vec3(0),0.52);
  vec3 bestColor = best < FAR ? shadeSphere(ro,rd,vec3(0),0.52,lightPos,true,false) : color;
  for (int i=0;i<20;i++) {
    vec3 pos = asteroidPosition(i,u_time);
    float radius = 0.035 + hash11(float(i)*5.3)*0.075;
    float hit = raySphere(ro,rd,pos,radius);
    if (hit < best) {
      best = hit;
      vec3 p = ro + rd*hit;
      vec3 n = normalize(p-pos);
      float rough = fbm(n*8.0+float(i));
      float light = max(dot(n,normalize(lightPos-p)),0.0);
      float risk = step(0.82,hash11(float(i)*12.7+u_data.y));
      bestColor = mix(vec3(0.20,0.15,0.12),vec3(0.68,0.36,0.16),rough)*(0.08+light) + vec3(1.0,0.08,0.02)*risk*0.16;
    }
  }
  float pulse = 0.5 + 0.5*sin(u_time*3.0);
  return bestColor + u_accent * u_data.y * pulse * 0.025;
}

vec3 renderSun(vec3 ro, vec3 rd, vec3 background) {
  float hit = raySphere(ro,rd,vec3(0),1.18);
  float proximity = sphereGlow(ro,rd,vec3(0),1.18);
  float corona = pow(clamp((proximity-0.32)/0.68,0.0,1.0),5.0);
  vec3 color = background + mix(vec3(0.8,0.03,0.01),vec3(1.0,0.55,0.04),corona)*corona*(0.65+u_bloom);
  if (hit < FAR) {
    vec3 p = ro+rd*hit;
    vec3 n = normalize(p);
    float plasma = fbm(n*7.0+vec3(0.0,u_time*0.11,u_time*0.04));
    float cells = fbm(n*23.0-u_time*0.06);
    float limb = pow(max(dot(n,-rd),0.0),0.42);
    color = mix(vec3(0.62,0.015,0.004),vec3(1.0,0.73,0.08),plasma*0.72+cells*0.28)*limb*2.1;
  }
  float cmeAngle = atan(rd.y,rd.x) + u_time*0.12;
  float plume = pow(max(0.0,sin(cmeAngle*3.0+fbm(rd*7.0)*2.0)),18.0)*corona;
  color += vec3(1.0,0.08,0.02)*plume*u_data.x*1.6;
  return color;
}

vec3 renderLens(vec3 ro, vec3 rd) {
  vec3 bhDirection = normalize(-ro);
  float impact = length(cross(rd,bhDirection));
  float bend = 0.018/max(impact*impact,0.008);
  vec3 tangent = normalize(bhDirection-rd*dot(bhDirection,rd));
  vec3 lensedDir = normalize(rd+tangent*bend);
  vec3 color = starField(lensedDir);
  float horizon = raySphere(ro,rd,vec3(0),0.67);
  if (horizon < FAR) color = vec3(0.0);
  if (abs(rd.y)>0.0001) {
    float t = -ro.y/rd.y;
    if (t>0.0) {
      vec3 p=ro+rd*t;
      float r=length(p.xz);
      if (r>0.78 && r<2.45) {
        float bands=0.55+0.45*sin(r*29.0-fbm(vec3(p.xz*2.0,u_time*0.08))*7.0);
        float fade=smoothstep(0.78,1.02,r)*smoothstep(2.45,1.3,r);
        float doppler=clamp(0.5+0.5*p.x/max(r,0.01),0.0,1.0);
        vec3 disk=mix(vec3(1.0,0.07,0.015),vec3(0.35,0.55,1.0),doppler)*bands*fade*2.3;
        color=max(color,disk);
      }
    }
  }
  float ring=exp(-90.0*abs(impact-0.112));
  color+=mix(vec3(1.0,0.18,0.03),u_accent,0.32)*ring*(0.4+u_bloom);
  return color;
}

vec3 aces(vec3 x) {
  float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
}

void main() {
  vec2 absolutePixel = gl_FragCoord.xy + u_tileOrigin;
  vec2 uv = (absolutePixel * 2.0 - u_fullResolution) / u_fullResolution.y;
  float yaw=u_camera.x, pitch=u_camera.y, distance=u_camera.z;
  vec3 ro=vec3(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch))*distance;
  vec3 forward=normalize(-ro);
  vec3 right=normalize(cross(forward,vec3(0.0,1.0,0.0)));
  vec3 up=normalize(cross(right,forward));
  vec3 rd=normalize(forward+uv.x*right*0.72+uv.y*up*0.72);
  vec3 background=starField(rd);
  vec3 color;
  if (u_scene==0) color=renderOrbit(ro,rd,background);
  else if (u_scene==1) color=renderEarth(ro,rd,background);
  else if (u_scene==2) color=renderNeo(ro,rd,background);
  else if (u_scene==3) color=renderSun(ro,rd,background);
  else color=renderLens(ro,rd);
  float vignette=1.0-0.18*pow(clamp(length(uv)*0.55,0.0,1.0),2.2);
  color*=vignette*u_exposure;
  float grain=(hash31(vec3(absolutePixel,u_time*60.0))-0.5)/255.0;
  color=aces(color)+grain;
  outColor=vec4(pow(max(color,0.0),vec3(1.0/2.2)),1.0);
}`,Je={orbit:0,earth:1,neo:2,helio:3,archive:4};function f(t,e,a){const o=t.getUniformLocation(e,a);if(o===null)throw new Error(`Shader uniform not found: ${a}`);return o}function ce(t,e,a){const o=t.createShader(e);if(!o)throw new Error("Unable to allocate a WebGL shader");if(t.shaderSource(o,a),t.compileShader(o),!t.getShaderParameter(o,t.COMPILE_STATUS)){const i=t.getShaderInfoLog(o)||"Unknown shader compilation error";throw t.deleteShader(o),new Error(i)}return o}function le(t){const e=ce(t,t.VERTEX_SHADER,je),a=ce(t,t.FRAGMENT_SHADER,Ye),o=t.createProgram();if(!o)throw new Error("Unable to allocate a WebGL program");if(t.attachShader(o,e),t.attachShader(o,a),t.linkProgram(o),t.deleteShader(e),t.deleteShader(a),!t.getProgramParameter(o,t.LINK_STATUS)){const i=t.getProgramInfoLog(o)||"Unknown shader link error";throw t.deleteProgram(o),new Error(i)}return o}function Xe(){const t=navigator.deviceMemory||4,e=navigator.hardwareConcurrency||4;return t>=6&&e>=8?"high":"balanced"}class Qe extends EventTarget{canvas;gl;program;uniforms;animationFrame=0;startTime=performance.now();previousFrame=this.startTime;frameAccumulator=0;frameCount=0;measuredFps=0;exporting=!1;reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;autoScale=1;eventCoords=new Float32Array(24);eventCount=0;pointers=new Map;previousPinchDistance=0;state={scene:"orbit",yaw:.48,pitch:.18,distance:4.2,orbitEnabled:!0,orbitSpeed:.22,orbitTilt:.18,paused:!1,exposure:1,dataEnergy:.36,dataRisk:.12,dataEvents:3,quality:"auto"};constructor(e){super(),this.canvas=document.createElement("canvas"),this.canvas.className="observatory-canvas",this.canvas.setAttribute("aria-label","Interactive computational space renderer"),this.canvas.tabIndex=0,e.append(this.canvas);const a=this.canvas.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,stencil:!1,powerPreference:"high-performance",preserveDrawingBuffer:!0});if(!a)throw new Error("WebGL 2 is not available on this device");this.gl=a,this.program=le(a),this.uniforms=this.readUniforms(),this.createGeometry(),this.bindEvents(),this.resize(!0),this.animationFrame=requestAnimationFrame(this.tick)}setScene(e){this.state.scene=e;const a={orbit:4.2,earth:4,neo:4.8,helio:4.2,archive:4};this.state.distance=a[e],this.dispatchEvent(new CustomEvent("scenechange",{detail:e}))}setQuality(e){this.state.quality=e,this.autoScale=1,this.resize(!0)}setReducedMotion(e){this.reducedMotion=e}setPaused(e){this.state.paused=e}setOrbit(e){this.state.orbitEnabled=e}setOrbitSpeed(e){this.state.orbitSpeed=Math.max(0,Math.min(1.2,e))}setOrbitTilt(e){this.state.orbitTilt=Math.max(-.9,Math.min(.9,e))}setExposure(e){this.state.exposure=Math.max(.4,Math.min(2.2,e))}setData(e,a,o){this.state.dataEnergy=Math.max(0,Math.min(1,e)),this.state.dataRisk=Math.max(0,Math.min(1,a)),this.state.dataEvents=Math.max(0,o)}setEarthEvents(e){this.eventCoords.fill(0),this.eventCount=Math.min(e.length,12);for(let a=0;a<this.eventCount;a+=1){const o=e[a];o&&(this.eventCoords[a*2]=o.longitude,this.eventCoords[a*2+1]=o.latitude)}}getStats(){const e=this.profile();return{fps:this.measuredFps,frameMs:this.measuredFps?1e3/this.measuredFps:0,width:this.canvas.width,height:this.canvas.height,pixelRatio:Math.min(devicePixelRatio||1,e.maxPixelRatio),renderScale:e.renderScale*this.autoScale,maxTextureSize:this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)}}async renderExport(e,a,o){if(this.exporting)throw new Error("An export is already running");this.exporting=!0;const i=document.createElement("canvas");if(i.width=e,i.height=a,i.width!==e||i.height!==a)throw this.exporting=!1,new Error("Requested canvas dimensions are not supported");const r=i.getContext("2d",{alpha:!1});if(!r)throw this.exporting=!1,new Error("2D export encoder is unavailable");const s=this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE),n=Math.min(2048,s),l=Math.ceil(e/n),p=Math.ceil(a/n),v=l*p,x=(performance.now()-this.startTime)/1e3;let ae=0;try{for(let F=0;F<p;F+=1)for(let $=0;$<l;$+=1){const q=$*n,H=F*n,C=Math.min(n,e-q),D=Math.min(n,a-H);this.canvas.width=C,this.canvas.height=D,this.render(x,C,D,e,a,q,H);const W=new Uint8Array(C*D*4);this.gl.readPixels(0,0,C,D,this.gl.RGBA,this.gl.UNSIGNED_BYTE,W);const oe=new Uint8ClampedArray(W.length),B=C*4;for(let N=0;N<D;N+=1){const ie=N*B,xe=(D-N-1)*B;oe.set(W.subarray(ie,ie+B),xe)}const Ee=new ImageData(oe,C,D);r.putImageData(Ee,q,a-H-D),ae+=1,o?.(ae/v),await new Promise(N=>requestAnimationFrame(()=>N()))}return i}finally{this.exporting=!1,this.resize(!0)}}destroy(){cancelAnimationFrame(this.animationFrame),this.gl.deleteProgram(this.program)}profile(){const e=this.state.quality==="auto"?Xe():this.state.quality;return re[e]??re.balanced}readUniforms(){const e=this.gl;return{resolution:f(e,this.program,"u_resolution"),fullResolution:f(e,this.program,"u_fullResolution"),tileOrigin:f(e,this.program,"u_tileOrigin"),time:f(e,this.program,"u_time"),camera:f(e,this.program,"u_camera"),scene:f(e,this.program,"u_scene"),starLayers:f(e,this.program,"u_starLayers"),bloom:f(e,this.program,"u_bloom"),exposure:f(e,this.program,"u_exposure"),accent:f(e,this.program,"u_accent"),data:f(e,this.program,"u_data"),eventCoords:f(e,this.program,"u_eventCoords[0]"),eventCount:f(e,this.program,"u_eventCount")}}createGeometry(){const e=this.gl,a=e.createVertexArray(),o=e.createBuffer();if(!a||!o)throw new Error("Unable to allocate WebGL geometry");e.bindVertexArray(a),e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,0,0)}bindEvents(){const e=this.canvas;e.addEventListener("contextmenu",o=>o.preventDefault()),e.addEventListener("pointerdown",o=>{e.setPointerCapture(o.pointerId),this.pointers.set(o.pointerId,o),e.focus({preventScroll:!0})}),e.addEventListener("pointermove",o=>{const i=this.pointers.get(o.pointerId);if(i){if(this.pointers.set(o.pointerId,o),this.pointers.size===1)this.state.yaw-=(o.clientX-i.clientX)*.006,this.state.pitch=Math.max(-1.2,Math.min(1.2,this.state.pitch+(o.clientY-i.clientY)*.005)),this.state.orbitEnabled=!1;else if(this.pointers.size===2){const r=[...this.pointers.values()],s=r[0],n=r[1];if(!s||!n)return;const l=Math.hypot(s.clientX-n.clientX,s.clientY-n.clientY);this.previousPinchDistance&&(this.state.distance=Math.max(2.2,Math.min(9,this.state.distance*(this.previousPinchDistance/l)))),this.previousPinchDistance=l}}});const a=o=>{this.pointers.delete(o.pointerId),this.pointers.size<2&&(this.previousPinchDistance=0)};e.addEventListener("pointerup",a),e.addEventListener("pointercancel",a),e.addEventListener("wheel",o=>{o.preventDefault(),this.state.distance=Math.max(2.2,Math.min(9,this.state.distance*Math.exp(o.deltaY*.0012)))},{passive:!1}),window.addEventListener("resize",()=>this.resize()),e.addEventListener("webglcontextlost",o=>{o.preventDefault(),cancelAnimationFrame(this.animationFrame),this.dispatchEvent(new CustomEvent("contextlost"))}),e.addEventListener("webglcontextrestored",()=>{this.program=le(this.gl),this.uniforms=this.readUniforms(),this.createGeometry(),this.resize(!0),this.animationFrame=requestAnimationFrame(this.tick),this.dispatchEvent(new CustomEvent("contextrestored"))})}resize(e=!1){if(this.exporting)return;const a=this.profile(),o=Math.min(devicePixelRatio||1,a.maxPixelRatio),i=a.renderScale*this.autoScale,r=Math.max(2,Math.floor(this.canvas.clientWidth*o*i)),s=Math.max(2,Math.floor(this.canvas.clientHeight*o*i));(e||this.canvas.width!==r||this.canvas.height!==s)&&(this.canvas.width=r,this.canvas.height=s)}tick=e=>{if(this.animationFrame=requestAnimationFrame(this.tick),this.exporting)return;const a=Math.min((e-this.previousFrame)/1e3,.1);this.previousFrame=e,!this.state.paused&&this.state.orbitEnabled&&!this.reducedMotion&&(this.state.yaw+=a*this.state.orbitSpeed,this.state.pitch+=(this.state.orbitTilt-this.state.pitch)*Math.min(1,a*.7)),this.resize(),this.render((e-this.startTime)/1e3,this.canvas.width,this.canvas.height,this.canvas.width,this.canvas.height,0,0),this.frameAccumulator+=e-(this.previousFrame-a*1e3),this.frameCount+=1,this.frameCount>=45&&(this.measuredFps=this.frameAccumulator>0?this.frameCount*1e3/this.frameAccumulator:0,this.frameAccumulator=0,this.frameCount=0,this.state.quality==="auto"&&!this.reducedMotion&&(this.measuredFps<48?this.autoScale=Math.max(.58,this.autoScale-.08):this.measuredFps>78&&(this.autoScale=Math.min(1.08,this.autoScale+.035))),this.dispatchEvent(new CustomEvent("stats",{detail:this.getStats()})))};render(e,a,o,i,r,s,n){const l=this.gl,p=this.profile(),v=Pe[this.state.scene];l.viewport(0,0,a,o),l.useProgram(this.program),l.uniform2f(this.uniforms.resolution,a,o),l.uniform2f(this.uniforms.fullResolution,i,r),l.uniform2f(this.uniforms.tileOrigin,s,n),l.uniform1f(this.uniforms.time,this.state.paused?0:e),l.uniform3f(this.uniforms.camera,this.state.yaw,this.state.pitch,this.state.distance),l.uniform1i(this.uniforms.scene,Je[this.state.scene]),l.uniform1i(this.uniforms.starLayers,p.starLayers),l.uniform1f(this.uniforms.bloom,p.bloom),l.uniform1f(this.uniforms.exposure,this.state.exposure),l.uniform3f(this.uniforms.accent,v[0],v[1],v[2]),l.uniform3f(this.uniforms.data,this.state.dataEnergy,this.state.dataRisk,this.state.dataEvents),l.uniform2fv(this.uniforms.eventCoords,this.eventCoords),l.uniform1i(this.uniforms.eventCount,this.eventCount),l.drawArrays(l.TRIANGLES,0,3)}}const Ze={en:"English","pt-BR":"Português",es:"Español","zh-CN":"简体中文",ko:"한국어",fr:"Français",ja:"日本語",de:"Deutsch",ar:"العربية"},he={missionControl:"Mission control",appSubtitle:"Live computational observatory",dataStreams:"data streams",live:"Live",cache:"Cached",demo:"Demo",loading:"Acquiring signal",unavailable:"Unavailable",modes:"Observatory modes",orbit:"Deep orbit",orbitDesc:"Ray-traced worlds, APOD context, and free-flight navigation.",earth:"Living Earth",earthDesc:"EPIC full-disc observations and active EONET events.",neo:"Near-Earth watch",neoDesc:"Close approaches rendered as a data-driven orbital swarm.",helio:"Heliophysics",helioDesc:"Solar flares and CMEs translated into light and sound.",archive:"NASA archive",archiveDesc:"Search NASA’s image, video, and audio record.",quality:"Image quality",auto:"Auto",low:"Low",balanced:"Balanced",high:"High",ultra:"Ultra",orbitMode:"Orbit mode",speed:"Speed",tilt:"Inclination",sound:"Sonification",record:"Record",stop:"Stop",export:"Export",exportStudio:"Export studio",format:"Format",resolution:"Resolution",viewport:"Viewport",fourK:"4K UHD",eightK:"8K UHD",download:"Render & download",exporting:"Rendering native-resolution frame…",recording:"Recording observatory canvas",apiKey:"NASA API key",apiKeyHint:"Optional. DEMO_KEY works with strict limits; a personal key remains in this browser session only.",apply:"Apply",refreshData:"Refresh live data",telemetry:"Telemetry",apiHealth:"API health & provenance",sourcePolicy:"Source policy",openDocs:"Official documentation",archived:"Archived",referenceOnly:"Reference only",browserReady:"Browser-ready",search:"Search",searchPlaceholder:"Moon, Webb, black hole, Artemis…",noResults:"No archive results yet.",about:"About this mission",aboutText:"OPUS 5 turns verified NASA data into an explorable instrument. Visuals are computational; source status is always visible.",help:"Controls",helpText:"Drag or use arrow keys to look around. Wheel or pinch to zoom. O toggles orbit, Space pauses, E exports, and R records.",reducedMotion:"Reduce motion",language:"Language",close:"Close",selected:"Selected signal",diameter:"Diameter",velocity:"Relative velocity",missDistance:"Miss distance",hazardous:"Potentially hazardous",activeEvents:"Active Earth events",solarEvents:"Recent solar events",dataTimestamp:"Data timestamp",fallbackNotice:"Live data is unavailable. The renderer is using a clearly marked deterministic demonstration signal.",liveNotice:"Connected to official NASA data.",privacy:"No analytics. No account. API keys are never committed or transmitted anywhere except NASA.",credits:"Independent educational project. Not an official NASA product.",capabilityWarning:"This device cannot safely encode the requested frame. Choose a lower resolution.",recorderFallback:"MP4 is not available in this browser; recording will use WebM.",copied:"Link copied"},et={missionControl:"Controle da missão",appSubtitle:"Observatório computacional ao vivo",dataStreams:"fluxos de dados",live:"Ao vivo",cache:"Em cache",demo:"Demonstração",loading:"Adquirindo sinal",unavailable:"Indisponível",modes:"Modos do observatório",orbit:"Órbita profunda",orbitDesc:"Mundos traçados por raios, contexto do APOD e navegação livre.",earth:"Terra viva",earthDesc:"Observações de disco completo do EPIC e eventos ativos do EONET.",neo:"Vigilância próxima à Terra",neoDesc:"Aproximações renderizadas como um enxame orbital orientado por dados.",helio:"Heliofísica",helioDesc:"Erupções solares e CMEs traduzidas em luz e som.",archive:"Arquivo NASA",archiveDesc:"Pesquise o acervo de imagem, vídeo e áudio da NASA.",quality:"Qualidade de imagem",auto:"Automática",low:"Baixa",balanced:"Equilibrada",high:"Alta",ultra:"Ultra",orbitMode:"Modo órbita",speed:"Velocidade",tilt:"Inclinação",sound:"Sonificação",record:"Gravar",stop:"Parar",export:"Exportar",exportStudio:"Estúdio de exportação",format:"Formato",resolution:"Resolução",viewport:"Tela atual",fourK:"4K UHD",eightK:"8K UHD",download:"Renderizar e baixar",exporting:"Renderizando quadro em resolução nativa…",recording:"Gravando o canvas do observatório",apiKey:"Chave da API NASA",apiKeyHint:"Opcional. DEMO_KEY funciona com limites rígidos; uma chave pessoal permanece apenas nesta sessão do navegador.",apply:"Aplicar",refreshData:"Atualizar dados ao vivo",telemetry:"Telemetria",apiHealth:"Saúde e proveniência das APIs",sourcePolicy:"Política da fonte",openDocs:"Documentação oficial",archived:"Arquivada",referenceOnly:"Somente referência",browserReady:"Pronta para navegador",search:"Pesquisar",searchPlaceholder:"Lua, Webb, buraco negro, Artemis…",noResults:"Ainda não há resultados do arquivo.",about:"Sobre esta missão",aboutText:"O OPUS 5 transforma dados verificados da NASA em um instrumento explorável. Os visuais são computacionais; o estado da fonte está sempre visível.",help:"Controles",helpText:"Arraste ou use as setas para olhar ao redor. Role ou pince para ampliar. O alterna órbita, Espaço pausa, E exporta e R grava.",reducedMotion:"Reduzir movimento",language:"Idioma",close:"Fechar",selected:"Sinal selecionado",diameter:"Diâmetro",velocity:"Velocidade relativa",missDistance:"Distância de passagem",hazardous:"Potencialmente perigoso",activeEvents:"Eventos ativos na Terra",solarEvents:"Eventos solares recentes",dataTimestamp:"Data dos dados",fallbackNotice:"Os dados ao vivo estão indisponíveis. O renderizador usa um sinal demonstrativo determinístico e claramente identificado.",liveNotice:"Conectado a dados oficiais da NASA.",privacy:"Sem analytics. Sem conta. Chaves nunca são salvas no código nem enviadas para fora da NASA.",credits:"Projeto educacional independente. Não é um produto oficial da NASA.",capabilityWarning:"Este dispositivo não consegue codificar esse quadro com segurança. Escolha uma resolução menor.",recorderFallback:"MP4 não está disponível neste navegador; a gravação usará WebM.",copied:"Link copiado"},tt={missionControl:"Control de misión",appSubtitle:"Observatorio computacional en vivo",dataStreams:"flujos de datos",live:"En vivo",cache:"En caché",demo:"Demostración",loading:"Adquiriendo señal",unavailable:"No disponible",modes:"Modos del observatorio",orbit:"Órbita profunda",orbitDesc:"Mundos trazados por rayos, contexto APOD y navegación libre.",earth:"Tierra viva",earthDesc:"Observaciones EPIC del disco terrestre y eventos activos EONET.",neo:"Vigilancia cercana",neoDesc:"Aproximaciones representadas como un enjambre orbital guiado por datos.",helio:"Heliofísica",helioDesc:"Erupciones solares y CME traducidas en luz y sonido.",archive:"Archivo NASA",archiveDesc:"Busca en el registro de imágenes, vídeo y audio de NASA.",quality:"Calidad de imagen",auto:"Auto",low:"Baja",balanced:"Equilibrada",high:"Alta",ultra:"Ultra",orbitMode:"Modo órbita",speed:"Velocidad",tilt:"Inclinación",sound:"Sonificación",record:"Grabar",stop:"Detener",export:"Exportar",exportStudio:"Estudio de exportación",format:"Formato",resolution:"Resolución",viewport:"Vista actual",fourK:"4K UHD",eightK:"8K UHD",download:"Renderizar y descargar",exporting:"Renderizando cuadro en resolución nativa…",recording:"Grabando el lienzo del observatorio",apiKey:"Clave API de NASA",apiKeyHint:"Opcional. DEMO_KEY tiene límites estrictos; una clave personal permanece solo en esta sesión.",apply:"Aplicar",refreshData:"Actualizar datos en vivo",telemetry:"Telemetría",apiHealth:"Estado y procedencia de APIs",sourcePolicy:"Política de fuente",openDocs:"Documentación oficial",archived:"Archivada",referenceOnly:"Solo referencia",browserReady:"Lista para navegador",search:"Buscar",searchPlaceholder:"Luna, Webb, agujero negro, Artemis…",noResults:"Todavía no hay resultados.",about:"Acerca de esta misión",aboutText:"OPUS 5 convierte datos verificados de NASA en un instrumento explorable. Los visuales son computacionales y el estado de la fuente siempre es visible.",help:"Controles",helpText:"Arrastra o usa las flechas para mirar. Rueda o pellizca para ampliar. O activa órbita, Espacio pausa, E exporta y R graba.",reducedMotion:"Reducir movimiento",language:"Idioma",close:"Cerrar",selected:"Señal seleccionada",diameter:"Diámetro",velocity:"Velocidad relativa",missDistance:"Distancia de paso",hazardous:"Potencialmente peligroso",activeEvents:"Eventos terrestres activos",solarEvents:"Eventos solares recientes",dataTimestamp:"Fecha de datos",fallbackNotice:"Los datos en vivo no están disponibles. El renderizador usa una señal de demostración determinista y marcada.",liveNotice:"Conectado a datos oficiales de NASA.",privacy:"Sin analítica. Sin cuenta. Las claves solo se transmiten a NASA.",credits:"Proyecto educativo independiente. No es un producto oficial de NASA.",capabilityWarning:"Este dispositivo no puede codificar ese cuadro con seguridad. Elige una resolución menor.",recorderFallback:"MP4 no está disponible; la grabación usará WebM.",copied:"Enlace copiado"},at={missionControl:"Contrôle de mission",appSubtitle:"Observatoire computationnel en direct",dataStreams:"flux de données",live:"Direct",cache:"Cache",demo:"Démo",loading:"Acquisition du signal",unavailable:"Indisponible",modes:"Modes de l’observatoire",orbit:"Orbite profonde",orbitDesc:"Mondes tracés par rayons, contexte APOD et navigation libre.",earth:"Terre vivante",earthDesc:"Observations EPIC du globe et événements EONET actifs.",neo:"Veille géocroiseurs",neoDesc:"Approches rapprochées sous forme d’essaim orbital piloté par les données.",helio:"Héliophysique",helioDesc:"Éruptions solaires et CME traduites en lumière et en son.",archive:"Archives NASA",archiveDesc:"Recherchez dans les images, vidéos et sons de la NASA.",quality:"Qualité d’image",auto:"Auto",low:"Faible",balanced:"Équilibrée",high:"Élevée",ultra:"Ultra",orbitMode:"Mode orbite",speed:"Vitesse",tilt:"Inclinaison",sound:"Sonification",record:"Enregistrer",stop:"Arrêter",export:"Exporter",exportStudio:"Studio d’export",format:"Format",resolution:"Résolution",viewport:"Vue actuelle",fourK:"4K UHD",eightK:"8K UHD",download:"Rendre et télécharger",exporting:"Rendu en résolution native…",recording:"Enregistrement du canevas",apiKey:"Clé API NASA",apiKeyHint:"Facultatif. DEMO_KEY est très limité ; une clé personnelle reste uniquement dans cette session.",apply:"Appliquer",refreshData:"Actualiser les données",telemetry:"Télémétrie",apiHealth:"État et provenance des API",sourcePolicy:"Politique de source",openDocs:"Documentation officielle",archived:"Archivée",referenceOnly:"Référence uniquement",browserReady:"Compatible navigateur",search:"Rechercher",searchPlaceholder:"Lune, Webb, trou noir, Artemis…",noResults:"Aucun résultat pour le moment.",about:"À propos de cette mission",aboutText:"OPUS 5 transforme des données NASA vérifiées en instrument explorable. Les visuels sont calculés et l’état des sources reste visible.",help:"Commandes",helpText:"Faites glisser ou utilisez les flèches. Molette ou pincement pour zoomer. O active l’orbite, Espace met en pause, E exporte et R enregistre.",reducedMotion:"Réduire les animations",language:"Langue",close:"Fermer",selected:"Signal sélectionné",diameter:"Diamètre",velocity:"Vitesse relative",missDistance:"Distance de passage",hazardous:"Potentiellement dangereux",activeEvents:"Événements terrestres actifs",solarEvents:"Événements solaires récents",dataTimestamp:"Horodatage",fallbackNotice:"Les données en direct sont indisponibles. Le rendu utilise un signal de démonstration déterministe clairement indiqué.",liveNotice:"Connecté aux données officielles de la NASA.",privacy:"Aucune analyse. Aucun compte. Les clés ne sont transmises qu’à la NASA.",credits:"Projet éducatif indépendant. Ce n’est pas un produit officiel de la NASA.",capabilityWarning:"Cet appareil ne peut pas encoder cette image en toute sécurité. Choisissez une résolution inférieure.",recorderFallback:"MP4 indisponible ; l’enregistrement utilisera WebM.",copied:"Lien copié"},ot={missionControl:"Missionskontrolle",appSubtitle:"Live-Computational-Observatorium",dataStreams:"Datenströme",live:"Live",cache:"Cache",demo:"Demo",loading:"Signal wird empfangen",unavailable:"Nicht verfügbar",modes:"Observatoriumsmodi",orbit:"Tiefe Umlaufbahn",orbitDesc:"Raytracing-Welten, APOD-Kontext und freie Navigation.",earth:"Lebendige Erde",earthDesc:"EPIC-Gesamtaufnahmen und aktive EONET-Ereignisse.",neo:"Erdnähe-Wache",neoDesc:"Nahe Begegnungen als datengesteuerter Orbitalschwarm.",helio:"Heliophysik",helioDesc:"Sonneneruptionen und CMEs als Licht und Klang.",archive:"NASA-Archiv",archiveDesc:"NASA-Bilder, Videos und Audio durchsuchen.",quality:"Bildqualität",auto:"Auto",low:"Niedrig",balanced:"Ausgewogen",high:"Hoch",ultra:"Ultra",orbitMode:"Orbit-Modus",speed:"Geschwindigkeit",tilt:"Neigung",sound:"Sonifikation",record:"Aufnehmen",stop:"Stoppen",export:"Export",exportStudio:"Exportstudio",format:"Format",resolution:"Auflösung",viewport:"Aktuelle Ansicht",fourK:"4K UHD",eightK:"8K UHD",download:"Rendern & herunterladen",exporting:"Frame in nativer Auflösung wird gerendert…",recording:"Observatorium wird aufgenommen",apiKey:"NASA-API-Schlüssel",apiKeyHint:"Optional. DEMO_KEY ist streng limitiert; ein persönlicher Schlüssel bleibt nur in dieser Sitzung.",apply:"Anwenden",refreshData:"Live-Daten aktualisieren",telemetry:"Telemetrie",apiHealth:"API-Status & Herkunft",sourcePolicy:"Quellenrichtlinie",openDocs:"Offizielle Dokumentation",archived:"Archiviert",referenceOnly:"Nur Referenz",browserReady:"Browserfähig",search:"Suchen",searchPlaceholder:"Mond, Webb, Schwarzes Loch, Artemis…",noResults:"Noch keine Archivergebnisse.",about:"Über diese Mission",aboutText:"OPUS 5 macht verifizierte NASA-Daten zu einem erforschbaren Instrument. Visuals werden berechnet; der Quellenstatus bleibt sichtbar.",help:"Steuerung",helpText:"Ziehen oder Pfeiltasten zum Umschauen. Mausrad oder Pinch zum Zoomen. O Orbit, Leertaste Pause, E Export, R Aufnahme.",reducedMotion:"Bewegung reduzieren",language:"Sprache",close:"Schließen",selected:"Ausgewähltes Signal",diameter:"Durchmesser",velocity:"Relative Geschwindigkeit",missDistance:"Vorbeiflugdistanz",hazardous:"Potenziell gefährlich",activeEvents:"Aktive Erdereignisse",solarEvents:"Jüngste Sonnenereignisse",dataTimestamp:"Datenzeitpunkt",fallbackNotice:"Live-Daten sind nicht verfügbar. Der Renderer verwendet ein klar markiertes deterministisches Demosignal.",liveNotice:"Mit offiziellen NASA-Daten verbunden.",privacy:"Keine Analytik. Kein Konto. Schlüssel werden nur an NASA übertragen.",credits:"Unabhängiges Bildungsprojekt. Kein offizielles NASA-Produkt.",capabilityWarning:"Dieses Gerät kann den Frame nicht sicher kodieren. Wähle eine niedrigere Auflösung.",recorderFallback:"MP4 ist nicht verfügbar; WebM wird verwendet.",copied:"Link kopiert"},it={missionControl:"任务控制",appSubtitle:"实时计算观测站",dataStreams:"数据流",live:"实时",cache:"缓存",demo:"演示",loading:"正在获取信号",unavailable:"不可用",modes:"观测模式",orbit:"深空轨道",orbitDesc:"光线追踪世界、APOD 背景与自由飞行导航。",earth:"活力地球",earthDesc:"EPIC 地球全景与 EONET 活动事件。",neo:"近地天体监测",neoDesc:"将近距离飞掠呈现为数据驱动的轨道群。",helio:"日球物理",helioDesc:"把太阳耀斑与日冕物质抛射转化为光与声音。",archive:"NASA 档案",archiveDesc:"搜索 NASA 的图像、视频和音频记录。",quality:"图像质量",auto:"自动",low:"低",balanced:"均衡",high:"高",ultra:"超高",orbitMode:"轨道模式",speed:"速度",tilt:"倾角",sound:"数据声化",record:"录制",stop:"停止",export:"导出",exportStudio:"导出工作室",format:"格式",resolution:"分辨率",viewport:"当前视图",fourK:"4K UHD",eightK:"8K UHD",download:"渲染并下载",exporting:"正在以原生分辨率渲染…",recording:"正在录制观测画布",apiKey:"NASA API 密钥",apiKeyHint:"可选。DEMO_KEY 限制严格；个人密钥只保留在本次浏览器会话。",apply:"应用",refreshData:"刷新实时数据",telemetry:"遥测",apiHealth:"API 状态与来源",sourcePolicy:"来源政策",openDocs:"官方文档",archived:"已归档",referenceOnly:"仅供参考",browserReady:"浏览器可用",search:"搜索",searchPlaceholder:"月球、韦布、黑洞、阿耳忒弥斯…",noResults:"暂无档案结果。",about:"关于本任务",aboutText:"OPUS 5 将经核验的 NASA 数据转化为可探索仪器。视觉由计算生成，来源状态始终可见。",help:"控制",helpText:"拖动或使用方向键观察，滚轮或双指缩放。O 切换轨道，空格暂停，E 导出，R 录制。",reducedMotion:"减少动态效果",language:"语言",close:"关闭",selected:"已选信号",diameter:"直径",velocity:"相对速度",missDistance:"掠过距离",hazardous:"潜在危险",activeEvents:"地球活动事件",solarEvents:"近期太阳事件",dataTimestamp:"数据时间",fallbackNotice:"实时数据不可用。渲染器正在使用明确标注的确定性演示信号。",liveNotice:"已连接 NASA 官方数据。",privacy:"无分析、无账户。密钥只发送给 NASA。",credits:"独立教育项目，并非 NASA 官方产品。",capabilityWarning:"此设备无法安全编码该画面，请选择较低分辨率。",recorderFallback:"此浏览器不支持 MP4，将使用 WebM。",copied:"链接已复制"},rt={missionControl:"미션 컨트롤",appSubtitle:"실시간 컴퓨테이셔널 관측소",dataStreams:"데이터 스트림",live:"실시간",cache:"캐시",demo:"데모",loading:"신호 수신 중",unavailable:"사용 불가",modes:"관측 모드",orbit:"심우주 궤도",orbitDesc:"레이 트레이싱 세계, APOD 맥락, 자유 비행 탐색.",earth:"살아있는 지구",earthDesc:"EPIC 지구 전면 관측과 활성 EONET 이벤트.",neo:"근지구 감시",neoDesc:"근접 통과를 데이터 기반 궤도 군집으로 시각화합니다.",helio:"태양권 물리학",helioDesc:"태양 플레어와 CME를 빛과 소리로 변환합니다.",archive:"NASA 아카이브",archiveDesc:"NASA 이미지, 영상, 오디오 기록을 검색합니다.",quality:"이미지 품질",auto:"자동",low:"낮음",balanced:"균형",high:"높음",ultra:"울트라",orbitMode:"궤도 모드",speed:"속도",tilt:"기울기",sound:"소니피케이션",record:"녹화",stop:"중지",export:"내보내기",exportStudio:"내보내기 스튜디오",format:"형식",resolution:"해상도",viewport:"현재 화면",fourK:"4K UHD",eightK:"8K UHD",download:"렌더링 및 다운로드",exporting:"원본 해상도 프레임 렌더링 중…",recording:"관측소 캔버스 녹화 중",apiKey:"NASA API 키",apiKeyHint:"선택 사항. DEMO_KEY는 제한이 엄격하며 개인 키는 이 브라우저 세션에만 남습니다.",apply:"적용",refreshData:"실시간 데이터 새로고침",telemetry:"텔레메트리",apiHealth:"API 상태 및 출처",sourcePolicy:"소스 정책",openDocs:"공식 문서",archived:"보관됨",referenceOnly:"참조 전용",browserReady:"브라우저 지원",search:"검색",searchPlaceholder:"달, 웹, 블랙홀, 아르테미스…",noResults:"아직 검색 결과가 없습니다.",about:"이 미션 소개",aboutText:"OPUS 5는 검증된 NASA 데이터를 탐색 가능한 기기로 바꿉니다. 시각은 계산되며 출처 상태가 항상 표시됩니다.",help:"조작법",helpText:"드래그하거나 방향키로 둘러보고 휠 또는 핀치로 확대합니다. O는 궤도, Space는 일시정지, E는 내보내기, R은 녹화입니다.",reducedMotion:"모션 줄이기",language:"언어",close:"닫기",selected:"선택된 신호",diameter:"지름",velocity:"상대 속도",missDistance:"통과 거리",hazardous:"잠재적 위험",activeEvents:"활성 지구 이벤트",solarEvents:"최근 태양 이벤트",dataTimestamp:"데이터 시각",fallbackNotice:"실시간 데이터를 사용할 수 없어 명확히 표시된 결정론적 데모 신호를 사용합니다.",liveNotice:"NASA 공식 데이터에 연결됨.",privacy:"분석 없음, 계정 없음. 키는 NASA 이외로 전송되지 않습니다.",credits:"독립 교육 프로젝트이며 NASA 공식 제품이 아닙니다.",capabilityWarning:"이 기기는 요청한 프레임을 안전하게 인코딩할 수 없습니다. 더 낮은 해상도를 선택하세요.",recorderFallback:"MP4를 지원하지 않아 WebM으로 녹화합니다.",copied:"링크 복사됨"},st={missionControl:"ミッションコントロール",appSubtitle:"ライブ計算観測所",dataStreams:"データストリーム",live:"ライブ",cache:"キャッシュ",demo:"デモ",loading:"信号取得中",unavailable:"利用不可",modes:"観測モード",orbit:"深宇宙軌道",orbitDesc:"レイトレーシングされた世界、APOD、自由飛行ナビゲーション。",earth:"生きている地球",earthDesc:"EPIC の全球観測と EONET の活動中イベント。",neo:"地球近傍監視",neoDesc:"接近天体をデータ駆動の軌道群として描画。",helio:"太陽圏物理",helioDesc:"太陽フレアと CME を光と音へ変換。",archive:"NASA アーカイブ",archiveDesc:"NASA の画像・映像・音声記録を検索。",quality:"画質",auto:"自動",low:"低",balanced:"バランス",high:"高",ultra:"ウルトラ",orbitMode:"軌道モード",speed:"速度",tilt:"傾斜",sound:"ソニフィケーション",record:"録画",stop:"停止",export:"書き出し",exportStudio:"書き出しスタジオ",format:"形式",resolution:"解像度",viewport:"現在の表示",fourK:"4K UHD",eightK:"8K UHD",download:"レンダーして保存",exporting:"ネイティブ解像度でレンダリング中…",recording:"観測キャンバスを録画中",apiKey:"NASA API キー",apiKeyHint:"任意。DEMO_KEY は厳しい制限があります。個人キーはこのセッションにのみ保持されます。",apply:"適用",refreshData:"ライブデータ更新",telemetry:"テレメトリ",apiHealth:"API 状態と出典",sourcePolicy:"ソースポリシー",openDocs:"公式ドキュメント",archived:"アーカイブ済み",referenceOnly:"参照のみ",browserReady:"ブラウザ対応",search:"検索",searchPlaceholder:"月、ウェッブ、ブラックホール、アルテミス…",noResults:"まだ結果がありません。",about:"このミッションについて",aboutText:"OPUS 5 は検証済み NASA データを探索可能な計器へ変換します。映像は計算され、出典状態は常に表示されます。",help:"操作",helpText:"ドラッグまたは矢印キーで視点移動。ホイールまたはピンチでズーム。O は軌道、Space は一時停止、E は書き出し、R は録画。",reducedMotion:"動きを減らす",language:"言語",close:"閉じる",selected:"選択信号",diameter:"直径",velocity:"相対速度",missDistance:"最接近距離",hazardous:"潜在的危険",activeEvents:"活動中の地球イベント",solarEvents:"最近の太陽イベント",dataTimestamp:"データ時刻",fallbackNotice:"ライブデータを利用できません。明示された決定論的デモ信号を使用しています。",liveNotice:"NASA 公式データに接続済み。",privacy:"分析なし、アカウントなし。キーは NASA 以外へ送信されません。",credits:"独立した教育プロジェクトで、NASA 公式製品ではありません。",capabilityWarning:"この端末では安全にエンコードできません。低い解像度を選択してください。",recorderFallback:"MP4 非対応のため WebM を使用します。",copied:"リンクをコピーしました"},nt={missionControl:"مركز التحكم بالمهمة",appSubtitle:"مرصد حاسوبي مباشر",dataStreams:"تدفقات بيانات",live:"مباشر",cache:"مخزّن",demo:"تجريبي",loading:"جارٍ التقاط الإشارة",unavailable:"غير متاح",modes:"أوضاع المرصد",orbit:"مدار عميق",orbitDesc:"عوالم بتتبع الأشعة وسياق APOD وتنقل حر.",earth:"الأرض الحية",earthDesc:"مشاهد EPIC الكاملة وأحداث EONET النشطة.",neo:"مراقبة الأجسام القريبة",neoDesc:"تمثيل الاقترابات كسرب مداري تقوده البيانات.",helio:"فيزياء الشمس",helioDesc:"تحويل التوهجات الشمسية وCME إلى ضوء وصوت.",archive:"أرشيف ناسا",archiveDesc:"ابحث في سجل ناسا للصور والفيديو والصوت.",quality:"جودة الصورة",auto:"تلقائي",low:"منخفضة",balanced:"متوازنة",high:"عالية",ultra:"فائقة",orbitMode:"وضع المدار",speed:"السرعة",tilt:"الميل",sound:"تحويل البيانات إلى صوت",record:"تسجيل",stop:"إيقاف",export:"تصدير",exportStudio:"استوديو التصدير",format:"الصيغة",resolution:"الدقة",viewport:"العرض الحالي",fourK:"4K UHD",eightK:"8K UHD",download:"تصيير وتنزيل",exporting:"جارٍ التصيير بالدقة الأصلية…",recording:"جارٍ تسجيل لوحة المرصد",apiKey:"مفتاح NASA API",apiKeyHint:"اختياري. DEMO_KEY محدود بشدة، والمفتاح الشخصي يبقى في جلسة المتصفح فقط.",apply:"تطبيق",refreshData:"تحديث البيانات المباشرة",telemetry:"القياس عن بعد",apiHealth:"حالة API ومصدرها",sourcePolicy:"سياسة المصدر",openDocs:"الوثائق الرسمية",archived:"مؤرشف",referenceOnly:"للمرجع فقط",browserReady:"جاهز للمتصفح",search:"بحث",searchPlaceholder:"القمر، ويب، ثقب أسود، أرتميس…",noResults:"لا توجد نتائج بعد.",about:"حول هذه المهمة",aboutText:"يحوّل OPUS 5 بيانات ناسا الموثقة إلى أداة قابلة للاستكشاف. المرئيات محسوبة وحالة المصدر ظاهرة دائماً.",help:"التحكم",helpText:"اسحب أو استخدم الأسهم للنظر، والعجلة أو القرص للتكبير. O للمدار، والمسافة للإيقاف، وE للتصدير، وR للتسجيل.",reducedMotion:"تقليل الحركة",language:"اللغة",close:"إغلاق",selected:"الإشارة المختارة",diameter:"القطر",velocity:"السرعة النسبية",missDistance:"مسافة المرور",hazardous:"خطر محتمل",activeEvents:"أحداث الأرض النشطة",solarEvents:"أحداث شمسية حديثة",dataTimestamp:"وقت البيانات",fallbackNotice:"البيانات المباشرة غير متاحة. يستخدم المصيّر إشارة تجريبية حتمية ومعلّمة بوضوح.",liveNotice:"متصل ببيانات ناسا الرسمية.",privacy:"لا تحليلات ولا حساب. لا تُرسل المفاتيح إلا إلى ناسا.",credits:"مشروع تعليمي مستقل، وليس منتجاً رسمياً لناسا.",capabilityWarning:"لا يستطيع هذا الجهاز ترميز الإطار بأمان. اختر دقة أقل.",recorderFallback:"MP4 غير متاح؛ سيُستخدم WebM.",copied:"تم نسخ الرابط"},O={en:he,"pt-BR":et,es:tt,"zh-CN":it,ko:rt,fr:at,ja:st,de:ot,ar:nt};let J="en";function ct(){const t=z("local","opus5-language");if(t&&t in O)return t;const e=typeof navigator<"u"?navigator.language:"en";if(e.toLowerCase().startsWith("pt"))return"pt-BR";if(e.toLowerCase().startsWith("zh"))return"zh-CN";const a=e.split("-")[0];return a in O?a:"en"}function me(t){J=t,document.documentElement.lang=t,document.documentElement.dir=t==="ar"?"rtl":"ltr",U("local","opus5-language",t)}function X(){return J}function m(t){return O[J][t]||he[t]}const ge=document.querySelector("#app");if(!ge)throw new Error("Application root was not found");me(ct());const lt=Object.entries(Ze).map(([t,e])=>`<option value="${t}">${e}</option>`).join("");ge.innerHTML=`
  <main class="observatory" id="main-controls">
    <div class="visual-stage" id="visual-stage">
      <div class="webgl-fallback" id="webgl-fallback" hidden>
        <span class="fallback-orbit"></span><span class="fallback-world"></span>
        <p>WebGL 2 unavailable — live NASA data remains accessible.</p>
      </div>
      <div class="scene-transition" aria-hidden="true"></div>
      <div class="reticle" aria-hidden="true"><span></span></div>
      <div class="grain" aria-hidden="true"></div>
    </div>

    <header class="topbar">
      <button class="brand" type="button" data-dialog="about-dialog" aria-label="About NASA COSMOS OPUS 5">
        <span class="brand-mark">O5</span>
        <span class="brand-copy"><strong>NASA COSMOS</strong><small>// OPUS 5</small></span>
      </button>
      <div class="mission-state" aria-live="polite">
        <span class="signal-dot"></span>
        <span id="global-status" data-i18n="loading">Acquiring signal</span>
        <span class="divider"></span>
        <span id="stream-count">06</span> <span data-i18n="dataStreams">data streams</span>
      </div>
      <div class="top-actions">
        <button class="icon-button" type="button" id="journey-button" aria-pressed="false" title="Cinematic journey"><span aria-hidden="true">▶</span><span class="desktop-label">Journey</span></button>
        <button class="icon-button" type="button" id="data-panel-toggle" aria-controls="data-panel" aria-expanded="true"><span aria-hidden="true">◫</span><span class="desktop-label" data-i18n="telemetry">Telemetry</span></button>
        <button class="icon-button" type="button" data-dialog="source-dialog"><span aria-hidden="true">⌁</span><span class="desktop-label" data-i18n="apiHealth">API health & provenance</span></button>
        <button class="icon-button" type="button" data-dialog="settings-dialog" aria-label="Settings"><span aria-hidden="true">⚙</span></button>
      </div>
    </header>

    <nav class="scene-rail" aria-label="Observatory modes">
      <span class="rail-label" data-i18n="modes">Observatory modes</span>
      <button class="scene-button active" type="button" data-scene="orbit" aria-pressed="true"><span class="scene-glyph">◉</span><span data-i18n="orbit">Deep orbit</span></button>
      <button class="scene-button" type="button" data-scene="earth" aria-pressed="false"><span class="scene-glyph">◎</span><span data-i18n="earth">Living Earth</span></button>
      <button class="scene-button" type="button" data-scene="neo" aria-pressed="false"><span class="scene-glyph">⟲</span><span data-i18n="neo">Near-Earth watch</span></button>
      <button class="scene-button" type="button" data-scene="helio" aria-pressed="false"><span class="scene-glyph">✦</span><span data-i18n="helio">Heliophysics</span></button>
      <button class="scene-button" type="button" data-scene="archive" aria-pressed="false"><span class="scene-glyph">▦</span><span data-i18n="archive">NASA archive</span></button>
    </nav>

    <aside class="data-panel" id="data-panel" aria-live="polite">
      <div class="panel-kicker"><span class="signal-dot small"></span><span id="panel-mode">LIVE SCIENCE FEED</span></div>
      <h1 id="scene-title" data-i18n="orbit">Deep orbit</h1>
      <p id="scene-description" data-i18n="orbitDesc">Ray-traced worlds, APOD context, and free-flight navigation.</p>
      <div class="data-content" id="data-content"><div class="skeleton tall"></div><div class="skeleton"></div></div>
      <footer class="data-footer"><span id="data-source">NASA OPEN DATA</span><time id="data-time">—</time></footer>
    </aside>

    <section class="control-deck" aria-label="Rendering and capture controls">
      <div class="deck-group quality-group">
        <label for="quality-select" data-i18n="quality">Image quality</label>
        <select id="quality-select">
          <option value="auto" data-i18n="auto">Auto</option><option value="low" data-i18n="low">Low</option>
          <option value="balanced" data-i18n="balanced">Balanced</option><option value="high" data-i18n="high">High</option>
          <option value="ultra" data-i18n="ultra">Ultra</option>
        </select>
      </div>
      <div class="deck-group orbit-group">
        <button class="toggle-button active" type="button" id="orbit-toggle" aria-pressed="true"><span class="toggle-led"></span><span data-i18n="orbitMode">Orbit mode</span></button>
        <label class="range-control"><span data-i18n="speed">Speed</span><input id="orbit-speed" type="range" min="0" max="1.2" step="0.02" value="0.22" /></label>
        <label class="range-control"><span data-i18n="tilt">Inclination</span><input id="orbit-tilt" type="range" min="-0.8" max="0.8" step="0.02" value="0.18" /></label>
      </div>
      <div class="deck-group capture-group">
        <button class="deck-button" type="button" id="sound-toggle" aria-pressed="false"><span aria-hidden="true">◖</span><span data-i18n="sound">Sonification</span></button>
        <button class="deck-button record-button" type="button" id="record-button"><span class="record-dot" aria-hidden="true"></span><span data-i18n="record">Record</span><time id="record-time" hidden>00:00</time></button>
        <button class="deck-button primary" type="button" data-dialog="export-dialog"><span aria-hidden="true">⇩</span><span data-i18n="export">Export</span></button>
      </div>
      <div class="deck-telemetry" aria-label="Renderer performance">
        <strong id="fps-value">—</strong><small>FPS</small><span></span><strong id="resolution-value">—</strong><small>PX</small>
      </div>
    </section>

    <div class="toast-region" id="toast-region" aria-live="assertive" aria-atomic="true"></div>
  </main>

  <dialog class="mission-dialog export-dialog" id="export-dialog">
    <form method="dialog" class="dialog-shell" id="export-form">
      <header><div><span class="eyebrow">COMPUTATIONAL CAPTURE</span><h2 data-i18n="exportStudio">Export studio</h2></div><button class="dialog-close" value="cancel" aria-label="Close">×</button></header>
      <div class="export-preview"><div class="preview-frame"><span>OPUS 5</span></div><p>Every still is re-rendered from the shader at the selected native resolution. It is not an upscaled screenshot.</p></div>
      <fieldset><legend data-i18n="resolution">Resolution</legend>
        <label class="choice-card"><input type="radio" name="resolution" value="viewport" checked /><strong data-i18n="viewport">Viewport</strong><small id="viewport-size">—</small></label>
        <label class="choice-card"><input type="radio" name="resolution" value="4k" /><strong data-i18n="fourK">4K UHD</strong><small>3840 × 2160</small></label>
        <label class="choice-card"><input type="radio" name="resolution" value="8k" /><strong data-i18n="eightK">8K UHD</strong><small>7680 × 4320 · tiled</small></label>
      </fieldset>
      <fieldset><legend data-i18n="format">Format</legend><div class="segmented">
        <label><input type="radio" name="format" value="png" checked /><span>PNG</span></label>
        <label><input type="radio" name="format" value="jpeg" /><span>JPEG</span></label>
        <label><input type="radio" name="format" value="webp" /><span>WEBP</span></label>
      </div></fieldset>
      <div class="progress-track" id="export-progress" hidden><span></span></div>
      <p class="dialog-message" id="export-message"></p>
      <footer><button type="button" class="secondary" data-close="export-dialog" data-i18n="close">Close</button><button type="submit" class="primary-action"><span>⇩</span><span data-i18n="download">Render & download</span></button></footer>
    </form>
  </dialog>

  <dialog class="mission-dialog settings-dialog" id="settings-dialog">
    <form method="dialog" class="dialog-shell" id="settings-form">
      <header><div><span class="eyebrow">LOCAL PREFERENCES</span><h2 data-i18n="missionControl">Mission control</h2></div><button class="dialog-close" value="cancel" aria-label="Close">×</button></header>
      <label class="field"><span data-i18n="language">Language</span><select id="language-select">${lt}</select></label>
      <label class="field"><span data-i18n="apiKey">NASA API key</span><input id="api-key-input" type="password" inputmode="text" autocomplete="off" placeholder="DEMO_KEY" /><small data-i18n="apiKeyHint">Optional. DEMO_KEY works with strict limits; a personal key remains in this browser session only.</small></label>
      <label class="switch-row"><span><strong data-i18n="reducedMotion">Reduce motion</strong><small>Preserves data interaction while limiting automated camera movement.</small></span><input id="reduced-motion" type="checkbox" /></label>
      <footer><button type="button" class="secondary" id="refresh-data" data-i18n="refreshData">Refresh live data</button><button type="submit" class="primary-action" data-i18n="apply">Apply</button></footer>
    </form>
  </dialog>

  <dialog class="mission-dialog source-dialog" id="source-dialog">
    <div class="dialog-shell wide">
      <header><div><span class="eyebrow">PROVENANCE LEDGER</span><h2 data-i18n="apiHealth">API health & provenance</h2></div><button class="dialog-close" data-close="source-dialog" aria-label="Close">×</button></header>
      <p class="source-intro">Live browser-safe endpoints are called through a rate-limited cache. Archived services remain discoverable; policy-restricted JPL SSD services are official deep links only.</p>
      <div class="source-grid" id="source-grid"></div>
      <footer class="legal-footer"><span data-i18n="privacy">No analytics. No account. API keys are never committed or transmitted anywhere except NASA.</span><span data-i18n="credits">Independent educational project. Not an official NASA product.</span></footer>
    </div>
  </dialog>

  <dialog class="mission-dialog archive-dialog" id="archive-dialog">
    <div class="dialog-shell gallery-shell">
      <header><div><span class="eyebrow">NASA MEDIA LIBRARY</span><h2 data-i18n="archive">NASA archive</h2></div><button class="dialog-close" data-close="archive-dialog" aria-label="Close">×</button></header>
      <form class="archive-search" id="archive-search"><label><span class="sr-only" data-i18n="search">Search</span><input id="archive-query" type="search" data-i18n-placeholder="searchPlaceholder" placeholder="Moon, Webb, black hole, Artemis…" maxlength="120" /></label><button type="submit" data-i18n="search">Search</button></form>
      <div class="archive-grid" id="archive-grid"><p data-i18n="noResults">No archive results yet.</p></div>
    </div>
  </dialog>

  <dialog class="mission-dialog about-dialog" id="about-dialog">
    <div class="dialog-shell about-shell">
      <header><div><span class="eyebrow">NASA COSMOS // OPUS 5</span><h2 data-i18n="about">About this mission</h2></div><button class="dialog-close" data-close="about-dialog" aria-label="Close">×</button></header>
      <div class="about-hero"><span class="brand-mark large">O5</span><p data-i18n="aboutText">OPUS 5 turns verified NASA data into an explorable instrument. Visuals are computational; source status is always visible.</p></div>
      <section><h3 data-i18n="help">Controls</h3><p data-i18n="helpText">Drag or use arrow keys to look around. Wheel or pinch to zoom. O toggles orbit, Space pauses, E exports, and R records.</p></section>
      <section class="principles"><article><strong>01</strong><span>Compute the visual</span></article><article><strong>02</strong><span>Show the source</span></article><article><strong>03</strong><span>Degrade honestly</span></article></section>
      <footer class="legal-footer"><span data-i18n="credits">Independent educational project. Not an official NASA product.</span></footer>
    </div>
  </dialog>
`;const d=t=>{const e=document.getElementById(t);if(!e)throw new Error(`Missing interface element: ${t}`);return e},dt=d("visual-stage"),w=new Ke,b=new Fe,T=new Ve;let h=null,j=null,P="orbit",de=0,ue=0;try{h=new Qe(dt),j=new Ge(h)}catch(t){d("webgl-fallback").hidden=!1,S(t instanceof Error?t.message:"WebGL initialization failed","error")}function ve(){document.querySelectorAll("[data-i18n]").forEach(e=>{const a=e.dataset.i18n;a&&a in O.en&&(e.textContent=m(a))}),document.querySelectorAll("[data-i18n-placeholder]").forEach(e=>{const a=e.dataset.i18nPlaceholder;a&&a in O.en&&(e.placeholder=m(a))});const t=d("language-select");t.value=X(),fe(P),Z()}function fe(t){const e=d("scene-title"),a=d("scene-description"),o={orbit:["orbit","orbitDesc"],earth:["earth","earthDesc"],neo:["neo","neoDesc"],helio:["helio","helioDesc"],archive:["archive","archiveDesc"]};e.textContent=m(o[t][0]),a.textContent=m(o[t][1])}function be(t){try{const e=new URL(t);return e.protocol==="https:"?e.href:null}catch{return null}}function c(t,e,a){const o=document.createElement(t);return e&&(o.className=e),a!==void 0&&(o.textContent=a),o}function k(t,e){const a=c("div","metric-card");return a.append(c("span","",t),c("strong","",e)),a}function L(t){t.mode,d("panel-mode").textContent=t.mode==="live"?m("liveNotice"):t.mode==="cache"?m("cache"):m("demo"),d("data-source").textContent=t.source.toUpperCase(),d("data-time").textContent=new Date(t.fetchedAt).toLocaleTimeString(X(),{hour:"2-digit",minute:"2-digit"});const e=d("global-status");e.textContent=t.mode==="live"?m("live"):t.mode==="cache"?m("cache"):m("demo"),document.body.dataset.dataMode=t.mode}function ut(t){L(t);const e=d("data-content");e.replaceChildren();const a=t.data,o=c("article","feature-card apod-card"),i=be(a.thumbnailUrl||(a.mediaType==="image"?a.url:""));if(i){const s=c("img");s.src=i,s.alt=a.title,s.loading="eager",s.referrerPolicy="no-referrer",o.append(s)}const r=c("div","feature-copy");r.append(c("span","eyebrow",`APOD · ${a.date}`),c("h2","",a.title),c("p","",a.explanation)),o.append(r),e.append(o),t.mode==="demo"&&e.append(c("p","notice demo-notice",m("fallbackNotice"))),h?.setData(.38,.08,1),b.setEnergy(.38)}function pt(t,e){L(t.mode==="live"?t:e);const a=d("data-content");a.replaceChildren();const o=c("div","metric-grid");o.append(k(m("activeEvents"),String(t.data.length)),k("EPIC",String(e.data.length))),a.append(o);const i=e.data[0];if(i&&be(i.imageUrl)){const s=c("figure","epic-frame"),n=c("img");n.src=i.imageUrl,n.alt=i.caption,n.loading="lazy",n.referrerPolicy="no-referrer",s.append(n,c("figcaption","",`DSCOVR EPIC · ${i.date.slice(0,16)} UTC`)),a.append(s)}const r=c("ol","signal-list");t.data.slice(0,6).forEach(s=>{const n=c("li");n.append(c("span","event-marker"),c("div")),n.lastElementChild.append(c("strong","",s.title),c("small","",`${s.category} · ${s.latitude.toFixed(1)}°, ${s.longitude.toFixed(1)}°`)),r.append(n)}),a.append(r),h?.setEarthEvents(t.data),h?.setData(Math.min(1,t.data.length/20),.18,t.data.length),b.setEnergy(Math.min(1,t.data.length/20))}function ht(t){L(t);const e=d("data-content");e.replaceChildren();const a=t.data.filter(n=>n.hazardous).length,o=Math.max(0,...t.data.map(n=>n.velocityKps)),i=c("div","metric-grid");i.append(k("Objects",String(t.data.length)),k(m("hazardous"),String(a)),k("MAX ΔV",`${o.toFixed(1)} km/s`)),e.append(i);const r=c("ol","neo-list");t.data.slice(0,8).forEach(n=>{const l=c("li",n.hazardous?"risk":""),p=c("div");p.append(c("strong","",n.name),c("small","",n.hazardous?m("hazardous"):"TRACKED"));const v=c("div","neo-metrics");v.append(c("span","",`${n.diameterKm.toFixed(2)} km`),c("span","",`${n.velocityKps.toFixed(1)} km/s`),c("span","",`${(n.missDistanceKm/1e6).toFixed(2)}M km`)),l.append(p,v),r.append(l)}),e.append(r);const s=t.data.length?a/t.data.length:0;h?.setData(Math.min(1,o/60),s,t.data.length),b.setEnergy(Math.min(1,o/60))}function mt(t){L(t);const e=d("data-content");e.replaceChildren();const a=t.data.filter(n=>n.type==="CME"),o=t.data.filter(n=>n.type==="FLR"),i=c("div","metric-grid");i.append(k("CME · 30D",String(a.length)),k("FLARE · 30D",String(o.length))),e.append(i);const r=c("ol","signal-list solar-list");t.data.slice(0,9).forEach(n=>{const l=c("li"),p=c("span",`solar-marker ${n.type.toLowerCase()}`),v=c("div");v.append(c("strong","",`${n.type} ${n.classType||(n.speedKps?`${n.speedKps.toFixed(0)} km/s`:"")}`.trim()),c("small","",new Date(n.startTime).toLocaleString(X()))),l.append(p,v),r.append(l)}),e.append(r);const s=Math.min(1,(o.length+a.length*1.4)/18);h?.setData(s,.1,t.data.length),b.setEnergy(s)}function ye(t){L(t);const e=d("data-content");e.replaceChildren();const a=c("button","archive-launch");a.type="button",a.dataset.dialog="archive-dialog",a.append(c("span","archive-symbol","▦"),c("strong","",m("archive")),c("small","",`${t.data.length} ${m("noResults").replace("No ","").replace(".","")}`)),a.addEventListener("click",()=>ee("archive-dialog")),e.append(a);const o=c("div","mini-mosaic");t.data.slice(0,4).forEach(i=>{const r=c("img");r.src=i.previewUrl,r.alt=i.title,r.loading="lazy",r.referrerPolicy="no-referrer",o.append(r)}),e.append(o,c("p","notice","NASA media remains separate from the computational canvas, preserving attribution and export integrity.")),Ae(t.data),h?.setData(.58,.05,t.data.length),b.setEnergy(.58)}function Ae(t){const e=d("archive-grid");if(e.replaceChildren(),!t.length){e.append(c("p","",m("noResults")));return}t.forEach(a=>{const o=c("article","archive-item"),i=c("img");i.src=a.previewUrl,i.alt=a.title,i.loading="lazy",i.referrerPolicy="no-referrer";const r=c("div");r.append(c("span","eyebrow",`${a.center} · ${a.date.slice(0,4)}`),c("h3","",a.title),c("p","",a.description));const s=c("a","archive-link","NASA ID ↗");s.href=`https://images.nasa.gov/details/${encodeURIComponent(a.nasaId)}`,s.target="_blank",s.rel="noopener noreferrer",r.append(s),o.append(i,r),e.append(o)})}async function K(t,e=!1){P=t,fe(t),d("data-content").replaceChildren(c("div","skeleton tall"),c("div","skeleton"));try{if(t==="orbit")ut(await w.loadApod(e));else if(t==="earth"){const a=await w.loadEarth(e);pt(a.events,a.epic)}else t==="neo"?ht(await w.loadNeo(e)):t==="helio"?mt(await w.loadSolar(e)):ye(await w.searchArchive(d("archive-query").value||"James Webb Space Telescope",e))}catch(a){S(a instanceof Error?a.message:m("unavailable"),"error")}}function Q(t){document.querySelectorAll("[data-scene]").forEach(o=>{const i=o.dataset.scene===t;o.classList.toggle("active",i),o.setAttribute("aria-pressed",String(i))});const e=document.querySelector(".scene-transition");e?.classList.remove("flash"),requestAnimationFrame(()=>e?.classList.add("flash")),h?.setScene(t),b.setScene(t),b.pulse(.35);const a=new URL(location.href);a.searchParams.set("scene",t),history.replaceState(null,"",a),K(t)}function Z(){const t=d("source-grid");t.replaceChildren();const e=new Map(w.getStatuses().map(a=>[a.id,a]));De.forEach(a=>{const o=e.get(a.id)?.status,i=c("article","source-card"),r=c("header"),s=a.status==="archived"?m("archived"):a.status==="reference-only"||a.browserPolicy==="deep-link-only"?m("referenceOnly"):m("browserReady");r.append(c("span",`status-light ${o||a.status}`),c("strong","",a.name),c("small","",s));const n=c("p","",a.description),l=c("footer");l.append(c("span","",a.agency));const p=c("a","",`${m("openDocs")} ↗`);p.href=a.docs,p.target="_blank",p.rel="noopener noreferrer",l.append(p),i.append(r,n,l),t.append(i)})}function ee(t){const e=d(t);e.open||e.showModal()}function S(t,e="info"){const a=d("toast-region"),o=c("div",`toast ${e}`,t);a.append(o),window.setTimeout(()=>o.remove(),5200)}function gt(){const t=d("journey-button"),e=!t.classList.contains("active");if(t.classList.toggle("active",e),t.setAttribute("aria-pressed",String(e)),window.clearInterval(de),e){const a=["orbit","earth","neo","helio","archive"];de=window.setInterval(()=>Q(a[(a.indexOf(P)+1)%a.length]),18e3)}}async function te(){const t=d("record-button"),e=t.querySelector("[data-i18n]"),a=d("record-time");if(T.isRecording){try{const o=await T.stop();pe(o.blob,`NASA-OPUS5-${P}-${new Date().toISOString().replaceAll(":","-").slice(0,19)}.${o.extension}`),S(`${o.extension.toUpperCase()} · ${(o.blob.size/1048576).toFixed(1)} MB`,"success")}catch(o){S(o instanceof Error?o.message:m("unavailable"),"error")}window.clearInterval(ue),t.classList.remove("recording"),a.hidden=!0,a.textContent="00:00",e&&(e.textContent=m("record"))}else{if(!h)return S("WebGL canvas is unavailable.","error");try{const o=T.start(h.canvas,b.getRecordingTrack(),60,120);t.classList.add("recording"),a.hidden=!1,e&&(e.textContent=m("stop")),o.startsWith("video/mp4")||S(m("recorderFallback")),ue=window.setInterval(()=>{const i=Math.floor(T.elapsedSeconds);a.textContent=`${String(Math.floor(i/60)).padStart(2,"0")}:${String(i%60).padStart(2,"0")}`},500)}catch(o){S(o instanceof Error?o.message:m("unavailable"),"error")}}}document.querySelectorAll("[data-scene]").forEach(t=>t.addEventListener("click",()=>Q(t.dataset.scene)));document.querySelectorAll("[data-dialog]").forEach(t=>t.addEventListener("click",()=>ee(t.dataset.dialog)));document.querySelectorAll("[data-close]").forEach(t=>t.addEventListener("click",()=>d(t.dataset.close).close()));document.querySelectorAll("dialog").forEach(t=>t.addEventListener("click",e=>{e.target===t&&t.close()}));d("journey-button").addEventListener("click",gt);d("data-panel-toggle").addEventListener("click",t=>{const e=t.currentTarget,a=d("data-panel");matchMedia("(max-width: 760px)").matches?(a.classList.toggle("mobile-open"),e.setAttribute("aria-expanded",String(a.classList.contains("mobile-open")))):(a.classList.toggle("collapsed"),e.setAttribute("aria-expanded",String(!a.classList.contains("collapsed"))))});d("quality-select").addEventListener("change",t=>{const e=t.target.value;h?.setQuality(e),U("local","opus5-quality",e);const a=new URL(location.href);a.searchParams.set("quality",e),history.replaceState(null,"",a)});d("orbit-toggle").addEventListener("click",t=>{const e=t.currentTarget,a=!e.classList.contains("active");e.classList.toggle("active",a),e.setAttribute("aria-pressed",String(a)),h?.setOrbit(a)});d("orbit-speed").addEventListener("input",t=>h?.setOrbitSpeed(Number(t.target.value)));d("orbit-tilt").addEventListener("input",t=>h?.setOrbitTilt(Number(t.target.value)));d("sound-toggle").addEventListener("click",async t=>{const e=t.currentTarget;await b.setEnabled(!b.isEnabled),e.classList.toggle("active",b.isEnabled),e.setAttribute("aria-pressed",String(b.isEnabled)),b.pulse(.2)});d("record-button").addEventListener("click",()=>{te()});T.addEventListener("limit",()=>{S("Recording reached the 120-second memory-safe limit."),te()});d("settings-form").addEventListener("submit",()=>{const t=d("language-select").value;me(t),ve();const e=d("api-key-input").value;e.trim()&&w.setApiKey(e);const a=d("reduced-motion").checked;h?.setReducedMotion(a),U("local","opus5-reduced-motion",String(a)),K(P,!0)});d("refresh-data").addEventListener("click",()=>{K(P,!0)});d("archive-search").addEventListener("submit",async t=>{t.preventDefault();const e=d("archive-query").value;d("archive-grid").replaceChildren(c("div","skeleton tall"));const o=await w.searchArchive(e,!0);Ae(o.data),P==="archive"&&ye(o)});d("export-form").addEventListener("submit",async t=>{if(t.preventDefault(),!j||!h)return S("Renderer unavailable","error");const e=new FormData(t.currentTarget),a=String(e.get("resolution")),o=String(e.get("format")),i=h.getStats(),r=a==="8k"?[7680,4320]:a==="4k"?[3840,2160]:[i.width,i.height],s=d("export-progress"),n=s.querySelector("span"),l=d("export-message");s.hidden=!1,n.style.width="0%",l.textContent=m("exporting");try{const p=await j.export({width:r[0],height:r[1],format:o,quality:o==="jpeg"?.94:1,filename:`NASA-OPUS5-${P}-${r[0]}x${r[1]}`},v=>{n.style.width=`${Math.round(v*100)}%`});l.textContent=`${o.toUpperCase()} · ${r[0]} × ${r[1]} · ${(p.size/1048576).toFixed(1)} MB`,S(l.textContent,"success")}catch(p){l.textContent=p instanceof Error&&p.message==="EXPORT_CAPABILITY"?m("capabilityWarning"):p instanceof Error?p.message:m("unavailable"),S(l.textContent,"error")}});h?.addEventListener("stats",t=>{const e=t.detail;d("fps-value").textContent=e.fps.toFixed(0),d("resolution-value").textContent=`${e.width}×${e.height}`,d("viewport-size").textContent=`${e.width} × ${e.height}`});w.addEventListener("status",()=>Z());window.addEventListener("keydown",t=>{t.target?.matches("input, select, textarea")||(t.key.toLowerCase()==="o"?d("orbit-toggle").click():t.key.toLowerCase()==="e"?ee("export-dialog"):t.key.toLowerCase()==="r"?te():t.key===" "?(t.preventDefault(),h&&h.setPaused(!h.state.paused)):h&&t.key.startsWith("Arrow")&&(t.preventDefault(),t.key==="ArrowLeft"&&(h.state.yaw-=.08),t.key==="ArrowRight"&&(h.state.yaw+=.08),t.key==="ArrowUp"&&(h.state.pitch=Math.min(1.2,h.state.pitch+.06)),t.key==="ArrowDown"&&(h.state.pitch=Math.max(-1.2,h.state.pitch-.06))))});const Se=new URLSearchParams(location.search),V=Se.get("scene"),I=Se.get("quality")||z("local","opus5-quality");I&&["auto","low","balanced","high","ultra"].includes(I)&&(d("quality-select").value=I,h?.setQuality(I));const we=z("local","opus5-reduced-motion")==="true"||window.matchMedia("(prefers-reduced-motion: reduce)").matches;d("reduced-motion").checked=we;h?.setReducedMotion(we);ve();Z();V&&["orbit","earth","neo","helio","archive"].includes(V)?Q(V):K("orbit");const vt=window;!vt.__OPUS5_ARTIFACT__&&"serviceWorker"in navigator&&location.protocol==="https:"&&window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
//# sourceMappingURL=opus5.js.map
