/**
 * WebGL2 管线。
 *
 * - **扇区**:每个可见节点一个实例,顶点在着色器里按 gl_VertexID 现拼 —— 顶面(环形扇区)、
 *   外壁、内壁、两道端面。角度用双精度拆成 hi / lo 两个 float 传进去,钻到第八层、一个节点
 *   只占整卷十万分之一圈时,边缘也不抖。视图(焦点的起止角、焦点的圈号)是 uniform,
 *   所以钻进 / 退出的整段过渡里不重建缓冲,只动几个数。
 *   顶面:按类型 / 年龄 / 可回收三种读法上色(三者按权重混合,切换时是渐变);1 px 的边;
 *   一道按文件数排的细线(一千个文件一根,文件越密越像条码,大文件是一整块平的);
 *   悬停的那块抬起来,它的祖先一路亮一档。
 * - **盘面**(程序化,着色器里按极坐标画,放多大都锐):轮毂上的表盘(焦点占整卷的比例、
 *   其中能回收的一截、一百道刻度)、贴着最外圈的量角刻度环、脚下很远的一张极坐标网。
 * - 线(实例化的屏幕空间四边形):方位臂、可回收位置上竖起的光柱。
 * - 扫描时的一片竖着转的光刃、飘着的尘埃。
 * - 后期:4× MSAA 的 HDR 缓冲 → 解析 → bloom → 色调映射、暗角、颗粒、边缘一点色差。
 */

import {
	BASE_Z,
	FLOOR_Z,
	GLSL_RING,
	RELIEF_RADIUS,
	RING,
	SCALE_RADIUS,
	type Vec3,
} from "./geometry";
import {
	AGE_RAMP,
	AMBER,
	ICE,
	MONO,
	NEUTRAL,
	rgb,
	TYPE_COLOR,
} from "./palette";

// ---------- 着色器 ----------

const QUAD_VERT = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const BG_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform vec2 u_center;
uniform float u_aspect;
void main() {
  vec2 d = (v_uv - u_center) * vec2(u_aspect, 1.0);
  float r = length(d);
  vec3 deep = vec3(0.0035, 0.0055, 0.0085);
  vec3 lift = vec3(0.012, 0.022, 0.032);
  vec3 c = mix(lift, deep, smoothstep(0.0, 1.1, r));
  c += vec3(0.006, 0.012, 0.016) * smoothstep(0.55, 0.0, abs(v_uv.y - u_center.y + 0.1)) * 0.6;
  o = vec4(c, 1.0);
}`;

const SECTOR_VERT = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec4 a_ang;
layout(location = 1) in vec4 a_meta;
layout(location = 2) in vec4 a_lens;
layout(location = 3) in vec4 a_misc;
layout(location = 4) in float a_range;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform vec2 u_f0;
uniform float u_inv;
uniform float u_fd;
uniform float u_rings;
uniform int u_segs;
uniform float u_reveal;
uniform float u_hover;
uniform float u_select;
uniform float u_lift;
uniform vec3 u_path;
uniform vec4 u_lensW;
uniform float u_filter;
uniform float u_finding;
uniform float u_search;
uniform vec3 u_palette[10];
uniform vec3 u_mono;
uniform vec3 u_age[5];
uniform vec3 u_neutral;
uniform vec3 u_amber;
out vec2 v_uv;
flat out int v_face;
out vec3 v_col;
out vec4 v_s;
out float v_dim;
out float v_amber;
out float v_depth;
out vec2 v_pos;
flat out float v_kind;
out float v_path;
out float v_match;
out float v_t;
${GLSL_RING}
const ivec2 OFF[6] = ivec2[6](ivec2(0, 0), ivec2(1, 0), ivec2(1, 1), ivec2(0, 0), ivec2(1, 1), ivec2(0, 1));

vec3 ageColor(float x) {
  float s = clamp(x, 0.0, 1.0) * 4.0;
  int i = int(min(floor(s), 3.0));
  return mix(u_age[i], u_age[i + 1], s - float(i));
}

void main() {
  float t0 = clamp(((a_ang.x - u_f0.x) + (a_ang.y - u_f0.y)) * u_inv, 0.0, 1.0);
  float t1 = clamp(((a_ang.z - u_f0.x) + (a_ang.w - u_f0.y)) * u_inv, 0.0, 1.0);
  float k = a_meta.x - u_fd;
  float fade = smoothstep(0.02, 0.85, k) * (1.0 - smoothstep(u_rings, u_rings + 1.0, k));
  float since = u_reveal - a_misc.x;
  float rv = clamp(since / 0.55, 0.0, 1.0);
  if (t1 - t0 < 2e-6 || fade <= 0.003 || rv <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  int S = u_segs;
  int vid = gl_VertexID;
  int face;
  int seg;
  int corner;
  if (vid < 6 * S) { face = 0; seg = vid / 6; corner = vid - seg * 6; }
  else if (vid < 12 * S) { face = 1; int c = vid - 6 * S; seg = c / 6; corner = c - seg * 6; }
  else if (vid < 18 * S) { face = 2; int c = vid - 12 * S; seg = c / 6; corner = c - seg * 6; }
  else { face = 3; int c = vid - 18 * S; seg = c / 6; corner = c - seg * 6; }
  ivec2 off = OFF[corner];

  float id = a_meta.y;
  float hovered = abs(id - u_hover) < 0.5 ? 1.0 : 0.0;
  float selected = abs(id - u_select) < 0.5 ? 1.0 : 0.0;
  float onPath = (u_path.z >= 0.0 && a_meta.x < u_path.z - 0.5 && t0 <= u_path.x + 1e-5 && t1 >= u_path.y - 1e-5) ? 1.0 : 0.0;

  float rin = ringInner(k);
  float rout = rin + ringWidth(k);
  float rise = 1.0 - (1.0 - rv) * (1.0 - rv) * (1.0 - rv);
  // 滑进轮毂的那一块往下沉(不压住表盘);滑出最外圈的也往下沉,边沉边散
  float sink = (1.0 - smoothstep(0.0, 1.0, k)) * 0.16 + smoothstep(u_rings, u_rings + 1.0, k) * 0.12;
  float ztop = ringTop(max(k, 1.0)) - sink - (1.0 - rise) * 0.32 + hovered * u_lift + selected * 0.012;

  float u;
  float v;
  float r;
  float theta;
  float z;
  if (face == 0) {
    u = (float(seg) + float(off.x)) / float(S);
    v = float(off.y);
    r = mix(rin, rout, v);
    theta = mix(t0, t1, u);
    z = ztop;
  } else if (face == 3) {
    u = float(off.x);
    v = float(off.y);
    r = mix(rin, rout, u);
    theta = seg == 0 ? t0 : t1;
    z = mix(ztop - WALL, ztop, v);
  } else {
    u = (float(seg) + float(off.x)) / float(S);
    v = float(off.y);
    r = face == 1 ? rout : rin;
    theta = mix(t0, t1, u);
    z = mix(ztop - WALL, ztop, v);
  }
  float a = theta * TAU;
  vec3 world = vec3(r * sin(a), r * cos(a), z);
  gl_Position = u_proj * u_view * vec4(world, 1.0);

  // 四种读法:单色(默认)、类型、年龄、可回收
  float h = fract(sin(id * 12.9898) * 43758.5453);
  vec3 monoCol = u_mono * (0.82 + 0.3 * h) * (1.0 - 0.05 * k);
  vec3 typeCol = u_palette[int(a_lens.x + 0.5)];
  typeCol = mix(u_neutral * 1.6, typeCol, smoothstep(0.3, 0.85, a_lens.y));
  vec3 ageCol = ageColor(a_lens.z);
  vec3 recCol = mix(u_neutral * 1.2, u_amber, smoothstep(0.0, 0.8, a_lens.w));
  vec3 col = monoCol * u_lensW.x + typeCol * u_lensW.y + ageCol * u_lensW.z + recCol * u_lensW.w;
  if (mod(a_meta.w, 8.0) >= 4.0) col = mix(col, u_neutral * 1.4, 0.55);
  // 形态:0 目录、1 单个文件、2 一堆零散小文件
  float fl = mod(a_meta.w, 4.0);
  v_kind = fl >= 2.0 ? 2.0 : (fl >= 1.0 ? 0.0 : 1.0);
  v_pos = world.xy;
  v_t = theta;

  v_uv = vec2(u, v);
  v_face = face;
  v_col = col;
  float glow = exp(-max(since, 0.0) * 1.6) * step(0.0, since) * (u_reveal < 1e5 ? 1.0 : 0.0);
  v_s = vec4(fade, glow, max(hovered, selected * 0.75), a_meta.z);
  v_path = onPath;
  v_dim = u_filter > 0.5 ? mix(0.09, 1.0, a_range) : 1.0;
  v_amber = (u_finding >= 0.0 && abs(a_misc.y - u_finding) < 0.5) ? 1.0 : 0.0;
  // 看一条可回收规则时,别的地方退暗,像打了一束追光;查找时同理
  if (u_finding >= 0.0 && v_amber < 0.5) v_dim *= 0.38;
  v_match = u_search > 0.5 ? a_misc.z : 0.0;
  if (u_search > 0.5 && a_misc.z <= 0.0) v_dim *= 0.32;
  v_depth = k;
}`;

const SECTOR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
flat in int v_face;
in vec3 v_col;
in vec4 v_s;
in float v_dim;
in float v_amber;
in float v_depth;
in vec2 v_pos;
flat in float v_kind;
in float v_path;
in float v_match;
in float v_t;
uniform float u_time;
uniform float u_sheen;
uniform vec3 u_amber;
uniform vec3 u_ice;
out vec4 o;
float line(float x, float px) {
  float w = max(fwidth(x), 1e-6) * px;
  float d = min(x, 1.0 - x);
  return 1.0 - smoothstep(w * 0.45, w * 1.45, d);
}
// 4×4 Bayer:淡入淡出用有序抖动的「纱窗透明」,和深度写入兼容,MSAA 下看起来是平滑的
float bayer(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  const float M[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (M[i] + 0.5) / 16.0;
}
void main() {
  float cover = v_s.x;
  if (cover < 0.999 && bayer(gl_FragCoord.xy) > cover) discard;
  // MSAA 下边缘像素的插值可能落在三角形外(v < 0),先夹住,否则 pow 出 NaN、顺着辉光糊一片
  vec2 uv = clamp(v_uv, 0.0, 1.0);
  vec3 base = v_col;
  float hl = v_s.z;
  vec3 c;
  float edge = 0.0;
  if (v_face == 0) {
    float eu = line(uv.x, 1.0);
    float ev = line(uv.y, 1.0);
    float rim = 1.0 - smoothstep(0.0, max(fwidth(uv.y), 1e-6) * 1.8, 1.0 - uv.y);
    edge = max(eu, ev);
    float fill;
    float tex = 0.0;
    if (v_kind < 0.5) {
      // 目录:玻璃,按文件数排的细线(一千个文件一根);线密到看不清时换成等量的亮度
      float n = v_s.w;
      float hx = uv.x * n;
      float hw = max(fwidth(hx), 1e-5);
      float d = abs(fract(hx + 0.5) - 0.5);
      float crisp = 1.0 - smoothstep(0.35 * hw, 1.1 * hw, d);
      float spacing = 1.0 / hw;
      float flat_ = clamp(1.3 / spacing, 0.0, 1.0) * 0.16;
      tex = mix(flat_, crisp, smoothstep(2.5, 6.0, spacing)) * step(0.5, n);
      tex *= smoothstep(0.1, 0.28, uv.y) * smoothstep(0.9, 0.72, uv.y);
      fill = 0.016 + 0.02 * uv.y;
    } else if (v_kind < 1.5) {
      // 单个文件:实心
      fill = 0.13 + 0.06 * uv.y;
    } else {
      // 零散小文件:颗粒
      vec2 g = v_pos / 0.0075;
      vec2 f = abs(fract(g) - 0.5);
      float dw = max(fwidth(g.x), 1e-5);
      float dot_ = (1.0 - smoothstep(0.12, 0.12 + dw * 1.2, length(f))) * smoothstep(0.08, 0.25, 1.0 / dw);
      tex = dot_ * 0.9 + 0.12 * (1.0 - smoothstep(0.08, 0.25, 1.0 / dw));
      fill = 0.035;
    }
    c = base * fill;
    c += base * tex * 0.3;
    c += mix(base, vec3(1.0), 0.25) * edge * 0.7;
    c += base * rim * 0.38;
  } else if (v_face == 3) {
    c = base * (0.015 + 0.06 * uv.y * uv.y);
    edge = line(uv.y, 1.0) * step(0.5, uv.y);
    c += base * edge * 0.3;
  } else {
    float g = pow(uv.y, 3.0);
    float inner = v_face == 2 ? 0.5 : 1.0;
    c = base * (0.006 + 0.05 * g) * inner;
    float top = 1.0 - smoothstep(0.0, max(fwidth(uv.y), 1e-6) * 1.4, 1.0 - uv.y);
    float seam = line(uv.x, 1.0) * 0.4;
    c += base * (top * 0.34 + seam * g * 0.4) * inner;
  }
  // 悬停 / 选中 / 祖先链:面板被照亮,边变白
  float lit = hl * (v_face == 0 ? 1.0 : 0.6);
  c += base * lit * (v_face == 0 ? 0.42 : 0.12);
  c += vec3(0.85, 0.95, 1.0) * edge * max(hl, v_path * 0.45) * 0.9;
  // 这一条可回收规则的位置:琥珀色,慢慢呼吸
  if (v_amber > 0.5) {
    float pulse = 0.72 + 0.28 * sin(u_time * 3.2);
    c = mix(c, u_amber * (v_face == 0 ? 0.28 : 0.1) * pulse, 0.8) + u_amber * edge * 1.1;
  }
  // 一道很淡的高光绕着顶面慢慢转(减弱动态效果时关掉)
  if (u_sheen >= 0.0 && v_face < 2) {
    float d = abs(fract(v_t - u_sheen + 0.5) - 0.5);
    c += base * exp(-d * d * 700.0) * (0.05 + 0.35 * edge);
  }
  if (v_match > 0.0) {
    float m = sqrt(v_match);
    c = mix(c, u_ice * (v_face == 0 ? 0.22 : 0.08), 0.6 * m) + u_ice * edge * (0.5 + 0.8 * m);
  }
  c += base * v_s.y * 1.1;
  c *= v_dim * mix(0.4, 1.0, v_s.x);
  o = vec4(c, 1.0);
}`;

const PLATE_VERT = `#version 300 es
precision highp float;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform float u_radius;
uniform float u_z;
out vec2 v_p;
const vec2 Q[6] = vec2[6](vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, 1.0), vec2(-1.0, 1.0));
void main() {
  vec2 q = Q[gl_VertexID];
  v_p = q * u_radius;
  gl_Position = u_proj * u_view * vec4(v_p, u_z, 1.0);
}`;

const PLATE_FRAG = `#version 300 es
precision highp float;
in vec2 v_p;
out vec4 o;
uniform int u_mode;
uniform float u_radius;
uniform float u_time;
uniform float u_value;
uniform float u_reclaim;
uniform float u_sweep;
uniform float u_cursor;
uniform float u_boot;
uniform vec3 u_ice;
uniform vec3 u_amber;
const float TAU = 6.283185307179586;
float ring(float r, float at, float px) {
  float w = fwidth(r) * px;
  return 1.0 - smoothstep(w * 0.4, w * 1.4, abs(r - at));
}
float band(float r, float a, float b) {
  float w = fwidth(r);
  return smoothstep(a - w, a + w, r) * (1.0 - smoothstep(b - w, b + w, r));
}
float ticks(float t, float n, float px, float r) {
  float x = t * n;
  float w = fwidth(x) * px;
  float d = abs(fract(x + 0.5) - 0.5);
  return 1.0 - smoothstep(w * 0.4, w * 1.2, d);
}
void main() {
  float r = length(v_p);
  float t = atan(v_p.x, v_p.y) / TAU;
  if (t < 0.0) t += 1.0;
  vec3 c = vec3(0.0);
  float R = u_radius;
  if (u_mode == 0) {
    // 轮毂上的表盘
    if (r > R) discard;
    float boot = clamp(u_boot, 0.0, 1.0);
    c += vec3(0.010, 0.016, 0.022) * (1.0 - r / R);
    c += u_ice * ring(r, R * 0.985, 1.2) * 0.55;
    c += u_ice * ring(r, R * 0.62, 0.9) * 0.10;
    c += u_ice * ring(r, R * 0.36, 0.9) * 0.08;
    float minor = ticks(t, 100.0, 1.1, r) * band(r, R * 0.87, R * 0.925);
    float major = ticks(t, 10.0, 1.4, r) * band(r, R * 0.84, R * 0.955);
    c += u_ice * (minor * 0.28 + major * 0.7) * step(t, boot);
    // 数值弧:焦点占整卷
    float v = u_value * boot;
    float arc = band(r, R * 0.70, R * 0.80);
    float on = 1.0 - smoothstep(v - fwidth(t), v + fwidth(t), t);
    float head = exp(-max(v - t, 0.0) * 30.0);
    c += u_ice * arc * (0.05 + on * (0.55 + 1.3 * head));
    // 其中可回收的一截,贴在数值弧的末端
    float rc0 = v - u_reclaim * boot;
    float rec = band(r, R * 0.655, R * 0.685) * step(rc0, t) * on;
    c += u_amber * rec * 1.1;
    // 扫描:雷达扫过的余辉
    if (u_sweep >= 0.0) {
      float lag = fract(u_sweep - t);
      c += u_ice * exp(-lag * 18.0) * band(r, R * 0.05, R * 0.97) * 0.35;
      c += u_ice * (1.0 - smoothstep(0.0, fwidth(t) * 1.5, min(lag, 1.0 - lag))) * band(r, R * 0.1, R) * 1.2;
    }
  } else if (u_mode == 1) {
    // 量角刻度环:一格 1%,十格一个长刻度
    float r0 = R - 0.028;
    if (r < r0 - 0.03 || r > R + 0.03) discard;
    float boot = clamp(u_boot, 0.0, 1.0);
    c += u_ice * ring(r, r0, 1.0) * 0.35 * boot;
    float minor = ticks(t, 100.0, 1.0, r) * band(r, r0, r0 + 0.012);
    float major = ticks(t, 10.0, 1.3, r) * band(r, r0, r0 + 0.028);
    c += u_ice * (minor * 0.22 + major * 0.55) * step(t, boot);
    if (u_cursor >= 0.0) {
      float d = abs(fract(t - u_cursor + 0.5) - 0.5);
      c += u_ice * (1.0 - smoothstep(0.0, fwidth(t) * 2.5, d)) * band(r, r0 - 0.02, r0 + 0.04) * 1.8;
    }
    if (u_sweep >= 0.0) {
      float lag = fract(u_sweep - t);
      c += u_ice * exp(-lag * 10.0) * band(r, r0 - 0.01, r0 + 0.03) * 0.6;
    }
  } else {
    // 脚下的极坐标网:越远越淡
    if (r > R) discard;
    float fall = (1.0 - smoothstep(R * 0.35, R, r));
    float circles = ticks(r / 0.25, 1.0, 1.0, r);
    float rays = ticks(t, 24.0, 0.9, r) * smoothstep(0.2, 0.5, r);
    float fine = ticks(t, 120.0, 0.7, r) * band(r, 1.12, 1.16);
    c += u_ice * (circles * 0.05 + rays * 0.03 + fine * 0.08) * fall;
    c += vec3(0.02, 0.05, 0.07) * exp(-r * r * 1.4) * 0.6;
    if (u_sweep >= 0.0) {
      float lag = fract(u_sweep - t);
      c += u_ice * exp(-lag * 7.0) * (1.0 - smoothstep(0.2, 1.3, r)) * 0.05;
    }
  }
  o = vec4(c, 1.0);
}`;

const LINE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_a;
layout(location = 1) in vec3 a_b;
layout(location = 2) in vec4 a_c;
layout(location = 3) in vec2 a_w;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform vec2 u_res;
out vec4 v_c;
out float v_e;
out float v_t;
flat out float v_h;
void main() {
  int id = gl_VertexID;
  float side = (id == 1 || id == 2 || id == 4) ? 1.0 : -1.0;
  float end = (id == 2 || id == 4 || id == 5) ? 1.0 : 0.0;
  vec4 pa = u_proj * u_view * vec4(a_a, 1.0);
  vec4 pb = u_proj * u_view * vec4(a_b, 1.0);
  vec2 sa = pa.xy / pa.w * u_res * 0.5;
  vec2 sb = pb.xy / pb.w * u_res * 0.5;
  vec2 dir = normalize(sb - sa + 1e-6);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 p = mix(pa, pb, end);
  float half_ = a_w.x * 0.5 + 1.0;
  p.xy += nrm * side * half_ * p.w / (u_res * 0.5);
  gl_Position = p;
  v_c = a_c;
  v_e = side * half_;
  v_t = end;
  v_h = half_;
}`;

const LINE_FRAG = `#version 300 es
precision highp float;
in vec4 v_c;
in float v_e;
in float v_t;
flat in float v_h;
out vec4 o;
uniform float u_fadeEnd;
void main() {
  // v_h 是半宽(像素,含 1 px 的抗锯齿边),v_e 是离中线多远
  float a = 1.0 - smoothstep(max(v_h - 1.4, 0.0), v_h, abs(v_e));
  float along = mix(1.0, 1.0 - v_t, u_fadeEnd);
  o = vec4(v_c.rgb * v_c.a * a * along, 1.0);
}`;

const BLADE_VERT = `#version 300 es
precision highp float;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform float u_angle;
uniform vec4 u_span;
out vec2 v_q;
const vec2 Q[6] = vec2[6](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 1.0));
void main() {
  vec2 q = Q[gl_VertexID];
  float r = mix(u_span.x, u_span.y, q.x);
  float z = mix(u_span.z, u_span.w, q.y);
  float a = u_angle * 6.283185307179586;
  v_q = q;
  gl_Position = u_proj * u_view * vec4(r * sin(a), r * cos(a), z, 1.0);
}`;

const BLADE_FRAG = `#version 300 es
precision highp float;
in vec2 v_q;
out vec4 o;
uniform vec3 u_ice;
uniform float u_alpha;
void main() {
  float top = pow(v_q.y, 3.0);
  float edge = 1.0 - smoothstep(0.0, fwidth(v_q.y) * 1.5, 1.0 - v_q.y);
  float radial = smoothstep(0.0, 0.08, v_q.x) * (1.0 - smoothstep(0.85, 1.0, v_q.x));
  vec3 c = u_ice * (top * 0.22 + edge * 1.4) * radial * u_alpha;
  o = vec4(c, 1.0);
}`;

const DUST_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_p;
uniform mat4 u_view;
uniform mat4 u_proj;
uniform float u_time;
uniform float u_resY;
uniform float u_floor;
out float v_a;
void main() {
  float h = 1.2;
  float z = u_floor + mod(a_p.z + u_time * 0.012 * (0.5 + a_p.w), h);
  float ang = a_p.x + u_time * 0.01 * (a_p.w - 0.5);
  vec3 p = vec3(a_p.y * sin(ang), a_p.y * cos(ang), z);
  vec4 cp = u_view * vec4(p, 1.0);
  gl_Position = u_proj * cp;
  float fadeZ = smoothstep(0.0, 0.25, z - u_floor) * (1.0 - smoothstep(h - 0.3, h, z - u_floor));
  v_a = fadeZ * (0.25 + 0.75 * a_p.w);
  gl_PointSize = clamp((1.2 + 2.2 * a_p.w) * u_resY / 1080.0 * 2.4 / max(-cp.z, 0.5), 1.0, 5.0);
}`;

const DUST_FRAG = `#version 300 es
precision highp float;
in float v_a;
out vec4 o;
uniform vec3 u_ice;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = exp(-dot(d, d) * 14.0) * v_a;
  o = vec4(u_ice * a * 0.16, 1.0);
}`;

const DOWN = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform bool u_prefilter;
uniform float u_threshold;
vec3 s(vec2 off) { return texture(u_src, v_uv + u_texel * off).rgb; }
void main() {
  vec3 a = s(vec2(-2.0, -2.0)), b = s(vec2(0.0, -2.0)), c = s(vec2(2.0, -2.0));
  vec3 d = s(vec2(-1.0, -1.0)), e = s(vec2(1.0, -1.0));
  vec3 f = s(vec2(-2.0, 0.0)), g = s(vec2(0.0)), h = s(vec2(2.0, 0.0));
  vec3 i = s(vec2(-1.0, 1.0)), j = s(vec2(1.0, 1.0));
  vec3 k = s(vec2(-2.0, 2.0)), l = s(vec2(0.0, 2.0)), m = s(vec2(2.0, 2.0));
  vec3 col = (d + e + i + j) * 0.125
    + (a + b + f + g) * 0.03125 + (b + c + g + h) * 0.03125
    + (f + g + k + l) * 0.03125 + (g + h + l + m) * 0.03125;
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  if (u_prefilter) {
    col = min(col, vec3(24.0));
    float br = max(col.r, max(col.g, col.b));
    float knee = 0.3;
    float soft = clamp(br - u_threshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    col *= max(soft, br - u_threshold) / max(br, 1e-4);
  }
  o = vec4(col, 1.0);
}`;

const UP = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_texel;
vec3 s(vec2 off) { return texture(u_src, v_uv + u_texel * off).rgb; }
void main() {
  vec3 c = s(vec2(-1.0, -1.0)) + 2.0 * s(vec2(0.0, -1.0)) + s(vec2(1.0, -1.0))
    + 2.0 * s(vec2(-1.0, 0.0)) + 4.0 * s(vec2(0.0)) + 2.0 * s(vec2(1.0, 0.0))
    + s(vec2(-1.0, 1.0)) + 2.0 * s(vec2(0.0, 1.0)) + s(vec2(1.0, 1.0));
  o = vec4(c / 16.0, 1.0);
}`;

const FINAL = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_img;
uniform sampler2D u_bloom;
uniform float u_bloomStrength;
uniform float u_grain;
uniform float u_time;
uniform vec2 u_size;
uniform float u_ca;
uniform bool u_linear;
uniform float u_exposure;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec2 uv = v_uv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  vec2 ca = d * r2 * u_ca;
  vec3 c = vec3(texture(u_img, uv - ca).r, texture(u_img, uv).g, texture(u_img, uv + ca).b);
  vec3 bl = texture(u_bloom, uv).rgb;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  if (any(isnan(bl)) || any(isinf(bl))) bl = vec3(0.0);
  c += bl * u_bloomStrength;
  c *= u_exposure;
  c *= mix(1.0, smoothstep(1.1, 0.2, length(d * vec2(1.0, 0.9))), 0.55);
  if (u_linear) c = pow(aces(c * 1.1), vec3(1.0 / 2.2));
  else c = clamp(c, 0.0, 1.0);
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  float g = hash(floor(uv * u_size) + floor(u_time * 24.0) * 17.31) - 0.5;
  c += g * u_grain * (0.35 + 0.65 * smoothstep(0.0, 0.35, luma));
  c += (hash(uv * u_size + 3.17) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

// ---------- 类型 ----------

/** 每个实例 16 个 float。 */
export const SECTOR_STRIDE = 16;

export interface LineSeg {
	a: Vec3;
	b: Vec3;
	color: [number, number, number, number];
	width: number;
}

export interface ReliefFrame {
	view: Float32Array;
	proj: Float32Array;
	time: number;
	/** 视图:焦点的起点(圈,双精度)、跨度、焦点的圈号。 */
	f0: number;
	span: number;
	fd: number;
	/** 回放的时钟;测完之后给一个很大的数。 */
	reveal: number;
	hover: number;
	select: number;
	lift: number;
	/** 悬停节点在视图里的起止与深度(祖先链),没有就 depth = -1。 */
	path: [number, number, number];
	lensW: [number, number, number, number];
	filter: boolean;
	finding: number;
	search: boolean;
	/** 高光转到哪儿(圈),关掉就给 -1。 */
	sheen: number;
	/** 表盘:焦点占整卷、其中可回收的比例、开场的刻度动画(0–1)。 */
	dial: { value: number; reclaim: number; boot: number };
	/** 扫描线的角度(视图圈),不在扫描时 -1。 */
	sweep: number;
	cursor: number;
	lines: LineSeg[];
	beamLines: LineSeg[];
	dust: boolean;
	exposure: number;
}

interface Program {
	program: WebGLProgram;
	u: Record<string, WebGLUniformLocation | null>;
}

function compile(
	gl: WebGL2RenderingContext,
	vert: string,
	frag: string,
): Program {
	const make = (type: number, src: string) => {
		const s = gl.createShader(type);
		if (!s) throw new Error("shader");
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost())
			throw new Error(gl.getShaderInfoLog(s) ?? "shader");
		return s;
	};
	const program = gl.createProgram();
	if (!program) throw new Error("program");
	const vs = make(gl.VERTEX_SHADER, vert);
	const fs = make(gl.FRAGMENT_SHADER, frag);
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost())
		throw new Error(gl.getProgramInfoLog(program) ?? "link");
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	const u: Program["u"] = {};
	const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
	for (let i = 0; i < n; i++) {
		const info = gl.getActiveUniform(program, i);
		if (!info) continue;
		const name = info.name.replace(/\[0\]$/, "");
		u[name] = gl.getUniformLocation(program, info.name);
	}
	return { program, u };
}

interface Surface {
	tex: WebGLTexture;
	fbo: WebGLFramebuffer;
	w: number;
	h: number;
}

const BIG_SEGS = 56;
const SMALL_SEGS = 5;

export class Relief {
	private gl: WebGL2RenderingContext;
	readonly linear: boolean;
	private bg: Program;
	private sector: Program;
	private plate: Program;
	private line: Program;
	private blade: Program;
	private dustP: Program;
	private down: Program;
	private up: Program;
	private final: Program;
	private quad: WebGLVertexArrayObject;
	private sectorVao: WebGLVertexArrayObject;
	private sectorBuf: WebGLBuffer;
	private rangeBuf: WebGLBuffer;
	private sectorCount = 0;
	private bigCount = 0;
	private lineVao: WebGLVertexArrayObject;
	private lineBuf: WebGLBuffer;
	private lineData = new Float32Array(12 * 256);
	private dustVao: WebGLVertexArrayObject;
	private dustCount = 900;
	private samples: number;
	private msFbo: WebGLFramebuffer | null = null;
	private msColor: WebGLRenderbuffer | null = null;
	private msDepth: WebGLRenderbuffer | null = null;
	private scene: Surface | null = null;
	private mips: Surface[] = [];
	private w = 0;
	private h = 0;
	private sw = 0;
	private sh = 0;
	private palette: Float32Array;
	private ageRamp: Float32Array;
	private ice = rgb(ICE);
	private mono = rgb(MONO);
	private amber = rgb(AMBER);
	private neutral = rgb(NEUTRAL);
	/** 画面在屏幕上的中心(给背景的光晕用)。 */
	center: [number, number] = [0.5, 0.5];

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		this.linear = !!gl.getExtension("EXT_color_buffer_float");
		this.samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
		this.bg = compile(gl, QUAD_VERT, BG_FRAG);
		this.sector = compile(gl, SECTOR_VERT, SECTOR_FRAG);
		this.plate = compile(gl, PLATE_VERT, PLATE_FRAG);
		this.line = compile(gl, LINE_VERT, LINE_FRAG);
		this.blade = compile(gl, BLADE_VERT, BLADE_FRAG);
		this.dustP = compile(gl, DUST_VERT, DUST_FRAG);
		this.down = compile(gl, QUAD_VERT, DOWN);
		this.up = compile(gl, QUAD_VERT, UP);
		this.final = compile(gl, QUAD_VERT, FINAL);
		const quad = gl.createVertexArray();
		if (!quad) throw new Error("vao");
		this.quad = quad;

		const palette = Object.values(TYPE_COLOR).flatMap(rgb);
		this.palette = new Float32Array(palette);
		this.ageRamp = new Float32Array(AGE_RAMP.flatMap(rgb));

		// 扇区:一份静态实例数据 + 一份年龄筛选的占比(常改)
		const vao = gl.createVertexArray();
		const buf = gl.createBuffer();
		const range = gl.createBuffer();
		if (!vao || !buf || !range) throw new Error("buffer");
		this.sectorVao = vao;
		this.sectorBuf = buf;
		this.rangeBuf = range;
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		const stride = SECTOR_STRIDE * 4;
		for (let i = 0; i < 4; i++) {
			gl.enableVertexAttribArray(i);
			gl.vertexAttribPointer(i, 4, gl.FLOAT, false, stride, i * 16);
			gl.vertexAttribDivisor(i, 1);
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, range);
		gl.enableVertexAttribArray(4);
		gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 4, 0);
		gl.vertexAttribDivisor(4, 1);
		gl.bindVertexArray(null);

		// 线
		const lvao = gl.createVertexArray();
		const lbuf = gl.createBuffer();
		if (!lvao || !lbuf) throw new Error("buffer");
		this.lineVao = lvao;
		this.lineBuf = lbuf;
		gl.bindVertexArray(lvao);
		gl.bindBuffer(gl.ARRAY_BUFFER, lbuf);
		gl.bufferData(gl.ARRAY_BUFFER, this.lineData.byteLength, gl.DYNAMIC_DRAW);
		const ls = 12 * 4;
		const layout: [number, number, number][] = [
			[0, 3, 0],
			[1, 3, 12],
			[2, 4, 24],
			[3, 2, 40],
		];
		for (const [loc, size, offset] of layout) {
			gl.enableVertexAttribArray(loc);
			gl.vertexAttribPointer(loc, size, gl.FLOAT, false, ls, offset);
			gl.vertexAttribDivisor(loc, 1);
		}
		gl.bindVertexArray(null);

		// 尘埃:固定种子
		const dvao = gl.createVertexArray();
		const dbuf = gl.createBuffer();
		if (!dvao || !dbuf) throw new Error("buffer");
		this.dustVao = dvao;
		const dust = new Float32Array(this.dustCount * 4);
		let seed = 0x9e3779b9;
		const rnd = () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		for (let i = 0; i < this.dustCount; i++) {
			dust[i * 4] = rnd() * Math.PI * 2;
			dust[i * 4 + 1] = 0.3 + Math.sqrt(rnd()) * 1.9;
			dust[i * 4 + 2] = rnd() * 1.2;
			dust[i * 4 + 3] = rnd();
		}
		gl.bindVertexArray(dvao);
		gl.bindBuffer(gl.ARRAY_BUFFER, dbuf);
		gl.bufferData(gl.ARRAY_BUFFER, dust, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
		gl.bindVertexArray(null);
	}

	/** 换一组可见扇区。前 bigCount 个是大块(细分多),其余是小块。 */
	setSectors(data: Float32Array, count: number, bigCount: number) {
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.sectorBuf);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			data.subarray(0, count * SECTOR_STRIDE),
			gl.STATIC_DRAW,
		);
		this.sectorCount = count;
		this.bigCount = bigCount;
	}

	/** 年龄筛选:每个实例落在范围里的字节占比。 */
	setRange(data: Float32Array) {
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.rangeBuf);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
	}

	private texture() {
		const gl = this.gl;
		const tex = gl.createTexture();
		if (!tex) throw new Error("texture");
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return tex;
	}

	private surface(w: number, h: number): Surface {
		const gl = this.gl;
		const tex = this.texture();
		if (this.linear)
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA16F,
				w,
				h,
				0,
				gl.RGBA,
				gl.HALF_FLOAT,
				null,
			);
		else
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA8,
				w,
				h,
				0,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				null,
			);
		const fbo = gl.createFramebuffer();
		if (!fbo) throw new Error("framebuffer");
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			tex,
			0,
		);
		return { tex, fbo, w, h };
	}

	private release() {
		const gl = this.gl;
		for (const s of [this.scene, ...this.mips]) {
			if (!s) continue;
			gl.deleteTexture(s.tex);
			gl.deleteFramebuffer(s.fbo);
		}
		this.scene = null;
		this.mips = [];
		if (this.msFbo) gl.deleteFramebuffer(this.msFbo);
		if (this.msColor) gl.deleteRenderbuffer(this.msColor);
		if (this.msDepth) gl.deleteRenderbuffer(this.msDepth);
		this.msFbo = null;
		this.msColor = null;
		this.msDepth = null;
	}

	/** w × h 是画布的设备像素;sceneScale 是画面缓冲相对它的比例(动态分辨率)。 */
	resize(w: number, h: number, sceneScale: number) {
		const sw = Math.max(16, Math.round(w * sceneScale));
		const sh = Math.max(16, Math.round(h * sceneScale));
		if (w === this.w && h === this.h && sw === this.sw && sh === this.sh)
			return;
		const gl = this.gl;
		this.release();
		this.w = w;
		this.h = h;
		this.sw = sw;
		this.sh = sh;
		const fmt = this.linear ? gl.RGBA16F : gl.RGBA8;
		this.msFbo = gl.createFramebuffer();
		this.msColor = gl.createRenderbuffer();
		this.msDepth = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.msColor);
		gl.renderbufferStorageMultisample(
			gl.RENDERBUFFER,
			this.samples,
			fmt,
			sw,
			sh,
		);
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.msDepth);
		gl.renderbufferStorageMultisample(
			gl.RENDERBUFFER,
			this.samples,
			gl.DEPTH_COMPONENT24,
			sw,
			sh,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo);
		gl.framebufferRenderbuffer(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.RENDERBUFFER,
			this.msColor,
		);
		gl.framebufferRenderbuffer(
			gl.FRAMEBUFFER,
			gl.DEPTH_ATTACHMENT,
			gl.RENDERBUFFER,
			this.msDepth,
		);
		this.scene = this.surface(sw, sh);
		let mw = sw;
		let mh = sh;
		for (let i = 0; i < 6; i++) {
			mw = Math.max(1, Math.floor(mw / 2));
			mh = Math.max(1, Math.floor(mh / 2));
			this.mips.push(this.surface(mw, mh));
			if (Math.min(mw, mh) < 10) break;
		}
	}

	get sceneSize() {
		return [this.sw, this.sh] as const;
	}

	private use(p: Program) {
		// biome-ignore lint/correctness/useHookAtTopLevel: WebGL 的 useProgram,不是 React hook
		this.gl.useProgram(p.program);
		return p.u;
	}

	private bindTex(
		unit: number,
		tex: WebGLTexture,
		loc: WebGLUniformLocation | null,
	) {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.uniform1i(loc, unit);
	}

	private uploadLines(lines: LineSeg[]) {
		const n = Math.min(lines.length, this.lineData.length / 12);
		const d = this.lineData;
		for (let i = 0; i < n; i++) {
			const l = lines[i];
			d.set(l.a, i * 12);
			d.set(l.b, i * 12 + 3);
			d.set(l.color, i * 12 + 6);
			d[i * 12 + 10] = l.width;
			d[i * 12 + 11] = 0;
		}
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.subarray(0, n * 12));
		return n;
	}

	render(fr: ReliefFrame) {
		const gl = this.gl;
		if (!this.msFbo || !this.scene) return;
		const { sw, sh } = this;

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo);
		gl.viewport(0, 0, sw, sh);
		gl.clearColor(0, 0, 0, 1);
		gl.clearDepth(1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		// 背景
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);
		gl.bindVertexArray(this.quad);
		let u = this.use(this.bg);
		gl.uniform2f(u.u_center, this.center[0], this.center[1]);
		gl.uniform1f(u.u_aspect, sw / sh);
		gl.drawArrays(gl.TRIANGLES, 0, 3);

		// 脚下的网(加法,不写深度)
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		u = this.use(this.plate);
		gl.uniformMatrix4fv(u.u_view, false, fr.view);
		gl.uniformMatrix4fv(u.u_proj, false, fr.proj);
		gl.uniform1f(u.u_time, fr.time);
		gl.uniform3fv(u.u_ice, this.ice);
		gl.uniform3fv(u.u_amber, this.amber);
		gl.uniform1f(u.u_sweep, fr.sweep);
		gl.uniform1f(u.u_boot, fr.dial.boot);
		gl.uniform1i(u.u_mode, 2);
		gl.uniform1f(u.u_radius, 2.4);
		gl.uniform1f(u.u_z, FLOOR_Z);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.disable(gl.BLEND);

		// 扇区(不透明,写深度)
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		if (this.sectorCount > 0) {
			u = this.use(this.sector);
			gl.uniformMatrix4fv(u.u_view, false, fr.view);
			gl.uniformMatrix4fv(u.u_proj, false, fr.proj);
			const hi = Math.fround(fr.f0);
			gl.uniform2f(u.u_f0, hi, fr.f0 - hi);
			gl.uniform1f(u.u_inv, 1 / Math.max(fr.span, 1e-12));
			gl.uniform1f(u.u_fd, fr.fd);
			gl.uniform1f(u.u_rings, RING.rings);
			gl.uniform1f(u.u_reveal, fr.reveal);
			gl.uniform1f(u.u_time, fr.time);
			gl.uniform1f(u.u_hover, fr.hover);
			gl.uniform1f(u.u_select, fr.select);
			gl.uniform1f(u.u_lift, fr.lift);
			gl.uniform3f(u.u_path, fr.path[0], fr.path[1], fr.path[2]);
			gl.uniform4f(
				u.u_lensW,
				fr.lensW[0],
				fr.lensW[1],
				fr.lensW[2],
				fr.lensW[3],
			);
			gl.uniform3fv(u.u_mono, this.mono);
			gl.uniform1f(u.u_filter, fr.filter ? 1 : 0);
			gl.uniform1f(u.u_finding, fr.finding);
			gl.uniform1f(u.u_search, fr.search ? 1 : 0);
			gl.uniform1f(u.u_sheen, fr.sheen);
			gl.uniform3fv(u.u_ice, this.ice);
			gl.uniform3fv(u.u_palette, this.palette);
			gl.uniform3fv(u.u_age, this.ageRamp);
			gl.uniform3fv(u.u_neutral, this.neutral);
			gl.uniform3fv(u.u_amber, this.amber);
			gl.bindVertexArray(this.sectorVao);
			if (this.bigCount > 0) {
				gl.uniform1i(u.u_segs, BIG_SEGS);
				gl.drawArraysInstanced(
					gl.TRIANGLES,
					0,
					18 * BIG_SEGS + 12,
					this.bigCount,
				);
			}
			const small = this.sectorCount - this.bigCount;
			if (small > 0) {
				// 小块从 bigCount 开始:把属性指针挪过去
				this.pointAt(this.bigCount);
				gl.uniform1i(u.u_segs, SMALL_SEGS);
				gl.drawArraysInstanced(gl.TRIANGLES, 0, 18 * SMALL_SEGS + 12, small);
				this.pointAt(0);
			}
		}

		// 盘面、线、光刃、尘埃:加法,读深度不写
		gl.depthMask(false);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		gl.bindVertexArray(this.quad);
		u = this.use(this.plate);
		gl.uniform1i(u.u_mode, 1);
		gl.uniform1f(u.u_radius, SCALE_RADIUS);
		gl.uniform1f(u.u_z, BASE_Z + 0.001);
		gl.uniform1f(u.u_cursor, fr.cursor);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		gl.uniform1i(u.u_mode, 0);
		gl.uniform1f(u.u_radius, RING.hub);
		gl.uniform1f(u.u_z, RING.hubZ);
		gl.uniform1f(u.u_value, fr.dial.value);
		gl.uniform1f(u.u_reclaim, fr.dial.reclaim);
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		if (fr.sweep >= 0) {
			u = this.use(this.blade);
			gl.uniformMatrix4fv(u.u_view, false, fr.view);
			gl.uniformMatrix4fv(u.u_proj, false, fr.proj);
			gl.uniform1f(u.u_angle, fr.sweep);
			gl.uniform4f(
				u.u_span,
				RING.hub,
				SCALE_RADIUS + 0.04,
				BASE_Z - 0.06,
				0.16,
			);
			gl.uniform3fv(u.u_ice, this.ice);
			gl.uniform1f(u.u_alpha, 1);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
		}

		const drawLines = (lines: LineSeg[], fadeEnd: number) => {
			if (!lines.length) return;
			const n = this.uploadLines(lines);
			const lu = this.use(this.line);
			gl.uniformMatrix4fv(lu.u_view, false, fr.view);
			gl.uniformMatrix4fv(lu.u_proj, false, fr.proj);
			gl.uniform2f(lu.u_res, sw, sh);
			gl.uniform1f(lu.u_fadeEnd, fadeEnd);
			gl.bindVertexArray(this.lineVao);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
		};
		drawLines(fr.lines, 0);
		drawLines(fr.beamLines, 1);

		if (fr.dust) {
			u = this.use(this.dustP);
			gl.uniformMatrix4fv(u.u_view, false, fr.view);
			gl.uniformMatrix4fv(u.u_proj, false, fr.proj);
			gl.uniform1f(u.u_time, fr.time);
			gl.uniform1f(u.u_resY, sh);
			gl.uniform1f(u.u_floor, FLOOR_Z);
			gl.uniform3fv(u.u_ice, this.ice);
			gl.bindVertexArray(this.dustVao);
			gl.drawArrays(gl.POINTS, 0, this.dustCount);
		}
		gl.depthMask(true);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);

		// 解析 MSAA
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFbo);
		gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.scene.fbo);
		gl.blitFramebuffer(
			0,
			0,
			sw,
			sh,
			0,
			0,
			sw,
			sh,
			gl.COLOR_BUFFER_BIT,
			gl.NEAREST,
		);

		// bloom
		gl.bindVertexArray(this.quad);
		let src = this.scene;
		const d = this.use(this.down);
		this.mips.forEach((mip, i) => {
			gl.bindFramebuffer(gl.FRAMEBUFFER, mip.fbo);
			gl.viewport(0, 0, mip.w, mip.h);
			this.bindTex(0, src.tex, d.u_src);
			gl.uniform2f(d.u_texel, 1 / src.w, 1 / src.h);
			gl.uniform1i(d.u_prefilter, i === 0 ? 1 : 0);
			gl.uniform1f(d.u_threshold, this.linear ? 0.62 : 0.55);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			src = mip;
		});
		const up = this.use(this.up);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		for (let i = this.mips.length - 1; i > 0; i--) {
			const from = this.mips[i];
			const to = this.mips[i - 1];
			gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
			gl.viewport(0, 0, to.w, to.h);
			this.bindTex(0, from.tex, up.u_src);
			gl.uniform2f(up.u_texel, 1 / from.w, 1 / from.h);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}
		gl.disable(gl.BLEND);

		// 出画
		const f = this.use(this.final);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.w, this.h);
		this.bindTex(0, this.scene.tex, f.u_img);
		this.bindTex(1, this.mips[0].tex, f.u_bloom);
		gl.uniform1f(f.u_bloomStrength, 0.95 / Math.max(1, this.mips.length - 1));
		gl.uniform1f(f.u_grain, 0.028);
		gl.uniform1f(f.u_time, fr.time);
		gl.uniform2f(f.u_size, this.w, this.h);
		gl.uniform1f(f.u_ca, 0.012);
		gl.uniform1i(f.u_linear, this.linear ? 1 : 0);
		gl.uniform1f(f.u_exposure, fr.exposure);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	/** 把扇区的实例属性指针挪到第 first 个实例。 */
	private pointAt(first: number) {
		const gl = this.gl;
		const stride = SECTOR_STRIDE * 4;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.sectorBuf);
		for (let i = 0; i < 4; i++)
			gl.vertexAttribPointer(
				i,
				4,
				gl.FLOAT,
				false,
				stride,
				first * stride + i * 16,
			);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.rangeBuf);
		gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 4, first * 4);
	}

	dispose() {
		const gl = this.gl;
		this.release();
		for (const p of [
			this.bg,
			this.sector,
			this.plate,
			this.line,
			this.blade,
			this.dustP,
			this.down,
			this.up,
			this.final,
		])
			gl.deleteProgram(p.program);
		gl.deleteBuffer(this.sectorBuf);
		gl.deleteBuffer(this.rangeBuf);
		gl.deleteBuffer(this.lineBuf);
		gl.deleteVertexArray(this.sectorVao);
		gl.deleteVertexArray(this.lineVao);
		gl.deleteVertexArray(this.dustVao);
		gl.deleteVertexArray(this.quad);
	}
}

export { RELIEF_RADIUS };
