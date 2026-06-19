import * as THREE from 'three'

// Time-of-day presets the runner cycles through as distance grows. Each frame
// the engine lerps between adjacent presets and pushes the result into the sky
// shader, fog and lights — so the city slides dusk -> night -> dawn -> day.

export interface SkyPreset {
  top: number
  horizon: number
  sun: number
  fog: number
  fogNear: number
  fogFar: number
  hemiSky: number
  hemiGround: number
  hemiInt: number
  sunColor: number
  sunInt: number
}

export const SKY_PHASES: SkyPreset[] = [
  {
    // dusk
    top: 0x241a48,
    horizon: 0xff7a44,
    sun: 0xffe7b0,
    fog: 0x6b4668,
    fogNear: 34,
    fogFar: 115,
    hemiSky: 0xffb489,
    hemiGround: 0x20203a,
    hemiInt: 0.85,
    sunColor: 0xffcaa0,
    sunInt: 2.1,
  },
  {
    // night
    top: 0x05060f,
    horizon: 0x1d2348,
    sun: 0x9fb0e0,
    fog: 0x101430,
    fogNear: 26,
    fogFar: 95,
    hemiSky: 0x2a3160,
    hemiGround: 0x0a0a16,
    hemiInt: 0.5,
    sunColor: 0x9fb0e0,
    sunInt: 0.7,
  },
  {
    // dawn
    top: 0x2a2a60,
    horizon: 0xff9a66,
    sun: 0xfff0d2,
    fog: 0x6a5a72,
    fogNear: 32,
    fogFar: 110,
    hemiSky: 0xffc6a0,
    hemiGround: 0x24243e,
    hemiInt: 0.9,
    sunColor: 0xffe0bc,
    sunInt: 1.8,
  },
  {
    // day
    top: 0x3f74c0,
    horizon: 0xbcd8f0,
    sun: 0xffffff,
    fog: 0xaecbe6,
    fogNear: 42,
    fogFar: 150,
    hemiSky: 0xcfe4ff,
    hemiGround: 0x55624f,
    hemiInt: 1.15,
    sunColor: 0xfff4e0,
    sunInt: 2.7,
  },
]

export interface SkyTargets {
  skyMat: THREE.ShaderMaterial
  fog: THREE.Fog
  hemi: THREE.HemisphereLight
  sun: THREE.DirectionalLight
  sunDisc: THREE.Mesh
}

const cA = new THREE.Color()
const cB = new THREE.Color()

function lerpHex(out: THREE.Color, a: number, b: number, t: number) {
  cA.setHex(a)
  cB.setHex(b)
  out.copy(cA).lerp(cB, t)
}

// phase is a continuous value; integer part selects a preset, fraction blends
export function applySky(t: SkyTargets, phase: number) {
  const n = SKY_PHASES.length
  const i = ((Math.floor(phase) % n) + n) % n
  const j = (i + 1) % n
  const f = phase - Math.floor(phase)
  const a = SKY_PHASES[i]
  const b = SKY_PHASES[j]

  const u = t.skyMat.uniforms
  lerpHex(u.top.value as THREE.Color, a.top, b.top, f)
  lerpHex(u.horizon.value as THREE.Color, a.horizon, b.horizon, f)
  lerpHex(u.sunCol.value as THREE.Color, a.sun, b.sun, f)

  lerpHex(t.fog.color, a.fog, b.fog, f)
  t.fog.near = a.fogNear + (b.fogNear - a.fogNear) * f
  t.fog.far = a.fogFar + (b.fogFar - a.fogFar) * f

  lerpHex(t.hemi.color, a.hemiSky, b.hemiSky, f)
  lerpHex(t.hemi.groundColor, a.hemiGround, b.hemiGround, f)
  t.hemi.intensity = a.hemiInt + (b.hemiInt - a.hemiInt) * f

  lerpHex(t.sun.color, a.sunColor, b.sunColor, f)
  t.sun.intensity = a.sunInt + (b.sunInt - a.sunInt) * f
  ;(t.sunDisc.material as THREE.MeshBasicMaterial).color.copy(u.sunCol.value as THREE.Color)
}
