export const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER = `#version 300 es
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
}`;
