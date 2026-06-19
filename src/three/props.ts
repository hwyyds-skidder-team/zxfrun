import * as THREE from 'three'
import type { Rng } from './textures'

// Reusable street-prop template factories. Each returns a THREE.Group that the
// engine clones and recycles along the street. Kept emissive-only (no extra
// real lights) so adding lots of them stays cheap.

const CAR_COLORS = [0xb23a48, 0x2f4858, 0x33673b, 0x6b4a2b, 0x394a6b, 0x8a8f99, 0x70314f]

export function makeLamp(): THREE.Group {
  const g = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.5, metalness: 0.6 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 5.4, 8), metal)
  pole.position.y = 2.7
  pole.castShadow = true
  g.add(pole)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), metal)
  arm.position.set(0.45, 5.3, 0)
  g.add(arm)
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.22, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.5 }),
  )
  head.position.set(0.9, 5.2, 0)
  g.add(head)
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffcf72, emissiveIntensity: 3 }),
  )
  bulb.position.set(0.9, 5.06, 0)
  g.add(bulb)
  // soft glow billboard
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.28, depthWrite: false }),
  )
  glow.position.set(0.9, 5.0, 0)
  g.add(glow)
  g.userData.glow = glow
  return g
}

export function makeTree(): THREE.Group {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 1.6, 7),
    new THREE.MeshStandardMaterial({ color: 0x3c2c20, roughness: 1 }),
  )
  trunk.position.y = 0.8
  trunk.castShadow = true
  g.add(trunk)
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2c5a3a, roughness: 1 })
  for (const [y, r] of [
    [1.9, 0.95],
    [2.5, 0.78],
    [3.0, 0.55],
  ] as const) {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leafMat)
    ball.position.y = y
    ball.castShadow = true
    g.add(ball)
  }
  return g
}

export function makeCar(rng: Rng): THREE.Group {
  const g = new THREE.Group()
  const color = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)]
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 3.8), bodyMat)
  body.position.y = 0.55
  body.castShadow = true
  g.add(body)
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x10151c, roughness: 0.2, metalness: 0.4 }),
  )
  cabin.position.set(0, 1.0, -0.2)
  g.add(cabin)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.8 })
  for (const wx of [-0.85, 0.85])
    for (const wz of [-1.2, 1.2]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12), wheelMat)
      w.rotation.z = Math.PI / 2
      w.position.set(wx, 0.32, wz)
      g.add(w)
    }
  // tail lights (red, facing +z / back of car)
  for (const lx of [-0.6, 0.6]) {
    const tl = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.16, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2a20, emissiveIntensity: 2.4 }),
    )
    tl.position.set(lx, 0.6, 1.92)
    g.add(tl)
  }
  // head lights (warm, facing -z)
  for (const lx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.16, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 2 }),
    )
    hl.position.set(lx, 0.6, -1.92)
    g.add(hl)
  }
  return g
}
