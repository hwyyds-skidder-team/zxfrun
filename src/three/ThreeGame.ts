import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { GameCallbacks, GameOverReason, ObjType, Screen } from '../game/types'
import {
  makeChocoTexture,
  makeFacadeTexture,
  makeRoadTexture,
  makeSpriteLabel,
  mulberry32,
  type Rng,
} from './textures'
import { makeCar, makeLamp, makeTree } from './props'
import { SoundManager } from '../game/sound'
import { applySky, type SkyTargets } from './sky'

const PHASE_DIST = 420 // metres of running per time-of-day phase

// ---- world constants (units) ----
const LANE_X = 2.3
const LANES = [-LANE_X, 0, LANE_X]
const ROAD_HALF = 3.6
// obstacles must fit inside a lane (with a gap) so neighbours never merge
const LANE_OBJ_W = 1.7
const SPAWN_Z = -100
const DESPAWN_Z = 14
const KMH = 5
const JUMP_V0 = 9.6
const GRAVITY = 19
const CLEAR_H = 0.62 // feet height that counts as "cleared" a low obstacle

const SPEECH_LINES = ['你跑不过我，你信吗？', '再加把劲，跟上！', '这点距离，不算什么！']

interface Obj3 {
  type: ObjType
  lane: number
  z: number
  resolved: boolean
  done: boolean
  mesh: THREE.Object3D
}

interface Building {
  mesh: THREE.Mesh
  z: number
  side: number
  height: number
}

function disposeMaterial(
  material: THREE.Material,
  seenMaterials: Set<THREE.Material>,
  seenTextures: Set<THREE.Texture>,
) {
  if (seenMaterials.has(material)) return
  seenMaterials.add(material)
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (value instanceof THREE.Texture && !seenTextures.has(value)) {
      seenTextures.add(value)
      value.dispose()
    }
  }
  material.dispose()
}

function disposeObject3D(
  root: THREE.Object3D,
  seenGeometries: Set<THREE.BufferGeometry>,
  seenMaterials: Set<THREE.Material>,
  seenTextures: Set<THREE.Texture>,
) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry instanceof THREE.BufferGeometry && !seenGeometries.has(mesh.geometry)) {
      seenGeometries.add(mesh.geometry)
      mesh.geometry.dispose()
    }
    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) disposeMaterial(material, seenMaterials, seenTextures)
    } else if (mesh.material instanceof THREE.Material) {
      disposeMaterial(mesh.material, seenMaterials, seenTextures)
    }
  })
}

export class ThreeGame {
  private cb: GameCallbacks
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private clock = new THREE.Clock()
  private raf = 0

  // state
  private state: Screen = 'menu'
  private speed = 8
  private totalDist = 0
  private score = 0
  private collectScore = 0
  private sugar = 0
  private best = 0
  private time = 0
  private runCycle = 0
  private distSinceSpawn = 0
  private lastFreeLane = 1
  private revives = 0
  private maxRevives = 1
  private boxGeo = new THREE.BoxGeometry(1, 1, 1)

  // player
  private player = { lane: 1, displayX: 0, y: 0, vy: 0, jumping: false, sliding: false, slideT: 0 }
  private root = new THREE.Group()
  private parts: Record<string, THREE.Object3D> = {}

  // speech
  private speakTimer = 3
  private speakHold = 0
  private speakIdx = 0

  // pools / lists
  private objs: Obj3[] = []
  private pools: Record<string, THREE.Object3D[]> = {
    barrier: [],
    treadmill: [],
    ice: [],
    sprite: [],
    overhead: [],
    wall: [],
  }
  private templates: Record<string, THREE.Object3D> = {}
  private buildings: Building[] = []
  private facadeMats: THREE.Material[] = []
  private cityRng: Rng = mulberry32(7)
  private props: { type: 'lamp' | 'tree' | 'car'; mesh: THREE.Object3D; side: number; z: number }[] = []

  // env
  private road!: THREE.Mesh
  private skyMat!: THREE.ShaderMaterial
  private sunDisc!: THREE.Mesh
  private hemi!: THREE.HemisphereLight
  private sunLight!: THREE.DirectionalLight
  private sky!: SkyTargets
  private sound = new SoundManager()
  private shake = 0

  // adaptive quality (auto-degrades on weak devices)
  private vw = 1
  private vh = 1
  private quality = 2 // 2 high, 1 medium, 0 low
  private fpsAccum = 0
  private fpsFrames = 0

  // particles
  private particles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; max: number }[] = []

  // weather
  private rain!: THREE.LineSegments
  private rainCount = 320
  private skyPhase = 0

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks) {
    this.cb = cb
    this.best = Number(localStorage.getItem('zxfrun_best') || 0)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping

    this.scene.fog = new THREE.Fog(0x6b4668, 34, 115)

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600)
    this.camera.position.set(0, 4.4, 7.6)
    this.camera.lookAt(0, 1.2, -10)

    this.buildSky()
    this.buildLights()
    this.sky = {
      skyMat: this.skyMat,
      fog: this.scene.fog as THREE.Fog,
      hemi: this.hemi,
      sun: this.sunLight,
      sunDisc: this.sunDisc,
    }
    this.buildRoad()
    this.buildTemplates()
    this.buildCity()
    this.buildProps()
    this.buildPlayer()
    this.buildParticles()
    this.buildRain()

    try {
      const composer = new EffectComposer(this.renderer)
      composer.addPass(new RenderPass(this.scene, this.camera))
      const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.8, 0.82)
      composer.addPass(bloom)
      composer.addPass(new OutputPass())
      this.composer = composer
      this.bloom = bloom
    } catch {
      this.composer = null
    }

    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  // ---------------- build ----------------
  private buildSky() {
    const geo = new THREE.SphereGeometry(400, 32, 16)
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x241a48) },
        horizon: { value: new THREE.Color(0xff7a44) },
        sunCol: { value: new THREE.Color(0xffe7b0) },
        sunDir: { value: new THREE.Vector3(0, 0.1, -1).normalize() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir; uniform vec3 top; uniform vec3 horizon; uniform vec3 sunCol; uniform vec3 sunDir;
        void main(){
          float t = smoothstep(-0.06, 0.55, vDir.y);
          vec3 col = mix(horizon, top, t);
          float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunCol * pow(d, 260.0) * 0.85;
          col += sunCol * pow(d, 10.0) * 0.16 * (1.0 - t);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
    this.scene.add(new THREE.Mesh(geo, mat))
    this.skyMat = mat

    // sun disc
    const sun = new THREE.Mesh(
      new THREE.CircleGeometry(9, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: false }),
    )
    sun.position.set(0, 6, -150)
    this.scene.add(sun)
    this.sunDisc = sun
  }

  private buildLights() {
    const hemi = new THREE.HemisphereLight(0xffb489, 0x20203a, 0.85)
    this.scene.add(hemi)
    this.hemi = hemi

    const sun = new THREE.DirectionalLight(0xffcaa0, 2.1)
    sun.position.set(-14, 16, -8)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    const cam = sun.shadow.camera
    cam.near = 1
    cam.far = 80
    cam.left = -14
    cam.right = 14
    cam.top = 14
    cam.bottom = -14
    sun.shadow.bias = -0.0005
    this.scene.add(sun)
    this.scene.add(sun.target)
    sun.target.position.set(0, 0, -6)
    this.sunLight = sun

    // warm fill from the sun side
    const fill = new THREE.DirectionalLight(0xff8a5a, 0.5)
    fill.position.set(6, 4, -10)
    this.scene.add(fill)
  }

  private buildRoad() {
    const rng = mulberry32(99)
    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x15121f, roughness: 1 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, -0.02, -60)
    ground.receiveShadow = true
    this.scene.add(ground)

    // road
    const roadTex = makeRoadTexture(rng, 3)
    roadTex.repeat.set(1, 16)
    this.road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, 260),
      new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.66, metalness: 0.0 }),
    )
    this.road.rotation.x = -Math.PI / 2
    this.road.position.set(0, 0, -100)
    this.road.receiveShadow = true
    this.scene.add(this.road)

    // sidewalks
    const swMat = new THREE.MeshStandardMaterial({ color: 0x3b3750, roughness: 0.9 })
    const mk = (sx: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 260), swMat)
      m.rotation.x = -Math.PI / 2
      m.position.set(sx * (ROAD_HALF + 1.2), 0.01, -100)
      m.receiveShadow = true
      this.scene.add(m)
    }
    mk(-1)
    mk(1)

    // curbs
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x6a6478, roughness: 0.9 })
    for (const s of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 260), curbMat)
      curb.position.set(s * ROAD_HALF, 0.09, -100)
      curb.receiveShadow = true
      this.scene.add(curb)
    }
  }

  // rounded box helper for soft, polished edges
  private rbox(w: number, h: number, d: number, r = 0.08, seg = 3) {
    return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2))
  }

  private buildTemplates() {
    // facade material pool
    for (let i = 0; i < 7; i++) {
      const { map } = makeFacadeTexture(this.cityRng)
      this.facadeMats.push(
        new THREE.MeshStandardMaterial({
          map,
          emissive: 0xffffff,
          emissiveMap: map,
          emissiveIntensity: 1.15,
          roughness: 0.92,
          metalness: 0,
        }),
      )
    }

    // barrier template (jumpable)
    {
      const g = new THREE.Group()
      const legMat = new THREE.MeshStandardMaterial({ color: 0x55606a, roughness: 0.7, metalness: 0.4 })
      for (const lx of [-0.66, 0.66]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.86, 12), legMat)
        leg.position.set(lx, 0.43, 0)
        leg.castShadow = true
        g.add(leg)
      }
      const board = new THREE.Mesh(
        this.rbox(LANE_OBJ_W, 0.56, 0.2, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xf0a01e, roughness: 0.6 }),
      )
      board.position.set(0, 0.84, 0)
      board.castShadow = true
      g.add(board)
      // hazard stripes
      for (let i = -2; i <= 2; i++) {
        const s = new THREE.Mesh(
          this.rbox(0.2, 0.52, 0.04, 0.02),
          new THREE.MeshStandardMaterial({ color: 0x1a1a1c }),
        )
        s.position.set(i * 0.32, 0.84, 0.1)
        s.rotation.z = 0.5
        g.add(s)
      }
      // amber beacon
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffb338, emissive: 0xffae33, emissiveIntensity: 2 }),
      )
      beacon.position.set(-0.72, 1.16, 0)
      g.add(beacon)
      this.templates.barrier = g
    }

    // treadmill template — LOW so it can be jumped over
    {
      const g = new THREE.Group()
      const deck = new THREE.Mesh(
        this.rbox(LANE_OBJ_W, 0.34, 1.5, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x262b36, roughness: 0.6, metalness: 0.3 }),
      )
      deck.position.y = 0.17
      deck.castShadow = true
      g.add(deck)
      const belt = new THREE.Mesh(
        this.rbox(1.2, 0.08, 1.3, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.5 }),
      )
      belt.position.y = 0.36
      g.add(belt)
      const railMat = new THREE.MeshStandardMaterial({ color: 0xaab2c0, roughness: 0.4, metalness: 0.6 })
      for (const sx of [-0.72, 0.72]) {
        const rail = new THREE.Mesh(this.rbox(0.12, 0.5, 1.5, 0.05), railMat)
        rail.position.set(sx, 0.34, 0)
        rail.castShadow = true
        g.add(rail)
      }
      // low front console
      const screen = new THREE.Mesh(
        this.rbox(1.0, 0.3, 0.1, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x0c1018 }),
      )
      screen.position.set(0, 0.62, -0.7)
      screen.rotation.x = -0.5
      g.add(screen)
      const scr = new THREE.Mesh(
        new THREE.PlaneGeometry(0.78, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x37e0b0, emissive: 0x37e0b0, emissiveIntensity: 1.6 }),
      )
      scr.position.set(0, 0.63, -0.65)
      scr.rotation.x = -0.5
      g.add(scr)
      this.templates.treadmill = g
    }

    // wall template — TALL concrete barrier, must switch lane (cannot jump)
    {
      const g = new THREE.Group()
      const concrete = new THREE.MeshStandardMaterial({ color: 0x8b8a86, roughness: 0.95 })
      const wall = new THREE.Mesh(this.rbox(LANE_OBJ_W, 2.3, 0.5, 0.08), concrete)
      wall.position.y = 1.15
      wall.castShadow = true
      g.add(wall)
      // hazard chevrons
      for (let i = -1; i <= 1; i++) {
        const ch = new THREE.Mesh(
          this.rbox(LANE_OBJ_W - 0.2, 0.34, 0.06, 0.03),
          new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xf0a01e : 0x1a1a1c }),
        )
        ch.position.set(0, 1.15 + i * 0.42, 0.26)
        g.add(ch)
      }
      // top warning light
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xff4d3a, emissive: 0xff3a28, emissiveIntensity: 2 }),
      )
      light.position.set(0, 2.42, 0)
      g.add(light)
      this.templates.wall = g
    }

    // 巧乐兹 — chocolate bar with a bitten cut-away revealing the layers:
    // dark chunky coating → golden biscuit → white vanilla → choc-nut core.
    {
      const g = new THREE.Group()
      const choc = new THREE.MeshStandardMaterial({ map: makeChocoTexture(), roughness: 0.36, metalness: 0.06 })
      const bar = new THREE.Mesh(this.rbox(0.74, 1.55, 0.46, 0.26), choc)
      bar.castShadow = true
      g.add(bar)
      // cut-away layers stacked toward the front (+z), framed by the chocolate
      const golden = new THREE.Mesh(
        this.rbox(0.56, 1.2, 0.08, 0.22),
        new THREE.MeshStandardMaterial({ color: 0xd9a52e, roughness: 0.55 }),
      )
      golden.position.set(0, 0.2, 0.21)
      g.add(golden)
      const white = new THREE.Mesh(
        this.rbox(0.42, 1.04, 0.09, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xfdf4e0, roughness: 0.6 }),
      )
      white.position.set(0, 0.22, 0.26)
      g.add(white)
      const core = new THREE.Mesh(
        this.rbox(0.26, 0.92, 0.11, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.4 }),
      )
      core.position.set(0, 0.24, 0.31)
      g.add(core)
      // nut bits embedded in the core
      const nutMat = new THREE.MeshStandardMaterial({ color: 0xab7740, roughness: 0.6 })
      const nutGeo = new THREE.SphereGeometry(0.036, 8, 6)
      const rn = mulberry32(21)
      for (let i = 0; i < 24; i++) {
        const n = new THREE.Mesh(nutGeo, nutMat)
        n.position.set((rn() - 0.5) * 0.18, 0.24 + (rn() - 0.5) * 0.84, 0.37)
        g.add(n)
      }
      // crunchy nibs on the chocolate coating (sides / back / lower-front / bottom)
      const nibMat = new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.75 })
      const nibGeo = new THREE.SphereGeometry(0.05, 8, 6)
      const r2 = mulberry32(13)
      for (let i = 0; i < 46; i++) {
        const nib = new THREE.Mesh(nibGeo, nibMat)
        const face = Math.floor(r2() * 5)
        const u = (r2() - 0.5) * 0.58
        const v = (r2() - 0.5) * 1.42
        if (face === 0) nib.position.set(u, Math.min(v, -0.45), 0.24) // lower front only
        else if (face === 1) nib.position.set(u, v, -0.24)
        else if (face === 2) nib.position.set(0.37, v, (r2() - 0.5) * 0.36)
        else if (face === 3) nib.position.set(-0.37, v, (r2() - 0.5) * 0.36)
        else nib.position.set(u, -0.79, (r2() - 0.5) * 0.36)
        g.add(nib)
      }
      const stick = new THREE.Mesh(
        this.rbox(0.15, 0.7, 0.15, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xe6c489, roughness: 0.85 }),
      )
      stick.position.y = -1.0
      g.add(stick)
      this.templates.ice = g
    }

    // 雪碧 — tall aluminium green can with silver top + pull-tab; wrapped label
    {
      const g = new THREE.Group()
      const green = new THREE.MeshStandardMaterial({
        map: makeSpriteLabel(),
        roughness: 0.26,
        metalness: 0.55,
      })
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 40), green)
      body.castShadow = true
      g.add(body)
      const silver = new THREE.MeshStandardMaterial({ color: 0xccd2d6, roughness: 0.26, metalness: 0.9 })
      const topRim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.305, 0.12, 36), silver)
      topRim.position.y = 0.78
      g.add(topRim)
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.03, 32), silver)
      lid.position.y = 0.85
      g.add(lid)
      const botRim = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.27, 0.1, 36), silver)
      botRim.position.y = -0.78
      g.add(botRim)
      const tab = new THREE.Mesh(this.rbox(0.16, 0.02, 0.1, 0.01), silver)
      tab.position.set(0, 0.87, 0.04)
      g.add(tab)
      this.templates.sprite = g
    }

    // overhead banner (slide under)
    {
      const g = new THREE.Group()
      const postMat = new THREE.MeshStandardMaterial({ color: 0x4a4f59, roughness: 0.6, metalness: 0.4 })
      for (const lx of [-0.92, 0.92]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.7, 14), postMat)
        post.position.set(lx, 1.35, 0)
        post.castShadow = true
        g.add(post)
      }
      const banner = new THREE.Mesh(
        this.rbox(1.84, 0.82, 0.2, 0.12),
        new THREE.MeshStandardMaterial({ color: 0xc23b4a, roughness: 0.75 }),
      )
      banner.position.set(0, 2.1, 0)
      banner.castShadow = true
      g.add(banner)
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.28),
        new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffc233, emissiveIntensity: 1.3 }),
      )
      stripe.position.set(0, 2.1, 0.11)
      g.add(stripe)
      this.templates.overhead = g
    }
  }

  private buildCity() {
    for (const side of [-1, 1]) {
      let z = -8
      for (let i = 0; i < 16; i++) {
        const b = this.makeBuilding(side, z)
        this.buildings.push(b)
        this.scene.add(b.mesh)
        z -= 6 + this.cityRng() * 4
      }
    }
  }

  private buildProps() {
    for (const side of [-1, 1]) {
      let z = -6
      for (let i = 0; i < 18; i++) {
        this.addProp(side, z)
        z -= 7 + this.cityRng() * 4
      }
    }
  }

  private addProp(side: number, z: number) {
    const r = this.cityRng()
    let type: 'lamp' | 'tree' | 'car'
    let mesh: THREE.Object3D
    let x: number
    if (r < 0.4) {
      type = 'lamp'
      mesh = makeLamp()
      x = side * (ROAD_HALF + 0.35)
      if (side > 0) mesh.rotation.y = Math.PI
    } else if (r < 0.75) {
      type = 'tree'
      mesh = makeTree()
      x = side * (ROAD_HALF + 1.5)
    } else {
      type = 'car'
      mesh = makeCar(this.cityRng)
      x = side * (ROAD_HALF + 0.85)
    }
    mesh.position.set(x, 0, z)
    this.scene.add(mesh)
    this.props.push({ type, mesh, side, z })
  }

  private updateSky() {
    const phase = this.totalDist / PHASE_DIST + (this.state === 'menu' ? this.time * 0.03 : 0)
    this.skyPhase = phase
    applySky(this.sky, phase)
  }

  private buildRain() {
    const n = this.rainCount
    const pos = new Float32Array(n * 6)
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 18
      const y = Math.random() * 15
      const z = -34 + Math.random() * 42
      const len = 0.5 + Math.random() * 0.45
      const o = i * 6
      pos[o] = x
      pos[o + 1] = y
      pos[o + 2] = z
      pos[o + 3] = x + 0.06
      pos[o + 4] = y - len
      pos[o + 5] = z + 0.18
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.LineBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: 0, depthWrite: false })
    this.rain = new THREE.LineSegments(geo, mat)
    this.rain.frustumCulled = false
    this.scene.add(this.rain)
  }

  private updateRain(dt: number) {
    const mat = this.rain.material as THREE.LineBasicMaterial
    const pn = ((this.skyPhase % 4) + 4) % 4
    const target = Math.max(0, 1 - Math.abs(pn - 1) / 0.85) * 0.5
    mat.opacity += (target - mat.opacity) * Math.min(1, dt * 2)
    if (mat.opacity < 0.012) return
    const attr = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    const fall = (30 + this.speed * 0.6) * dt
    for (let i = 0; i < this.rainCount; i++) {
      const o = i * 6
      arr[o + 1] -= fall
      arr[o + 4] -= fall
      if (arr[o + 4] < 0) {
        const x = (Math.random() - 0.5) * 18
        const y = 14 + Math.random() * 3
        const z = -34 + Math.random() * 42
        const len = 0.5 + Math.random() * 0.45
        arr[o] = x
        arr[o + 1] = y
        arr[o + 2] = z
        arr[o + 3] = x + 0.06
        arr[o + 4] = y - len
        arr[o + 5] = z + 0.18
      }
    }
    attr.needsUpdate = true
  }

  private updateProps(dist: number) {
    for (const p of this.props) {
      p.z += dist
      p.mesh.position.z = p.z
      if (p.z > 22) {
        let minZ = 0
        for (const q of this.props) if (q.side === p.side) minZ = Math.min(minZ, q.z)
        p.z = minZ - (7 + this.cityRng() * 4)
        p.mesh.position.z = p.z
      }
    }
  }

  private makeBuilding(side: number, z: number): Building {
    const h = 7 + this.cityRng() * 34
    const w = 4 + this.cityRng() * 5
    const d = 4 + this.cityRng() * 6
    const mat = this.facadeMats[Math.floor(this.cityRng() * this.facadeMats.length)]
    // shared unit-box geometry scaled per building (no per-building allocation)
    const mesh = new THREE.Mesh(this.boxGeo, mat)
    mesh.scale.set(w, h, d)
    // anchor the INNER face beyond the sidewalk (account for half the width)
    const x = side * (ROAD_HALF + 2.4 + this.cityRng() * 4 + w / 2)
    mesh.position.set(x, h / 2, z)
    return { mesh, z, side, height: h }
  }

  private buildPlayer() {
    const root = this.root
    root.position.set(0, 0, 0)
    this.scene.add(root)

    const skin = new THREE.MeshStandardMaterial({ color: 0xffd9ad, roughness: 0.8 })
    const tracksuit = new THREE.MeshStandardMaterial({ color: 0xff7a36, roughness: 0.7 })
    const pants = new THREE.MeshStandardMaterial({ color: 0x26407a, roughness: 0.7 })
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 })
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x241f2c, roughness: 0.8 })
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x222028, roughness: 0.4, metalness: 0.3 })

    // torso: tapered (chest wider than waist) for a more human shape
    const torso = new THREE.Mesh(this.rbox(0.58, 0.86, 0.36, 0.16), tracksuit)
    torso.position.y = 1.16
    torso.scale.set(1, 1, 1)
    torso.castShadow = true
    root.add(torso)
    this.parts.torso = torso
    // chest (shoulders) — wider block at the top
    const chest = new THREE.Mesh(this.rbox(0.7, 0.3, 0.4, 0.16), tracksuit)
    chest.position.set(0, 0.32, 0)
    chest.castShadow = true
    torso.add(chest)
    // rounded shoulder caps
    for (const sx of [-0.33, 0.33]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), tracksuit)
      cap.position.set(sx, 0.34, 0)
      torso.add(cap)
    }
    // white side stripes
    for (const sx of [-0.29, 0.29]) {
      const st = new THREE.Mesh(
        this.rbox(0.06, 0.7, 0.37, 0.03),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
      )
      st.position.set(sx, -0.02, 0)
      torso.add(st)
    }

    const head = new THREE.Group()
    head.position.y = 1.78
    root.add(head)
    this.parts.head = head
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), skin)
    face.castShadow = true
    head.add(face)
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.275, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat)
    head.add(hair)
    // glasses (two rings) on the front (-z)
    for (const gx of [-0.1, 0.1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 8, 16), glassMat)
      ring.position.set(gx, -0.02, -0.24)
      head.add(ring)
    }

    const mkLimb = (upperLen: number, lowerLen: number, rad: number, mat: THREE.Material, shoe: boolean) => {
      const hip = new THREE.Group()
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(rad, upperLen, 4, 8), mat)
      upper.position.y = -upperLen / 2
      upper.castShadow = true
      hip.add(upper)
      const knee = new THREE.Group()
      knee.position.y = -upperLen
      hip.add(knee)
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(rad * 0.9, lowerLen, 4, 8), mat)
      lower.position.y = -lowerLen / 2
      lower.castShadow = true
      knee.add(lower)
      if (shoe) {
        const sh = new THREE.Mesh(this.rbox(rad * 2.4, 0.14, rad * 3.4, 0.06), shoeMat)
        sh.position.set(0, -lowerLen - 0.02, -rad)
        knee.add(sh)
      }
      return { hip, knee }
    }

    const legL = mkLimb(0.42, 0.4, 0.12, pants, true)
    const legR = mkLimb(0.42, 0.4, 0.12, pants, true)
    legL.hip.position.set(-0.16, 0.86, 0)
    legR.hip.position.set(0.16, 0.86, 0)
    root.add(legL.hip, legR.hip)
    this.parts.legLHip = legL.hip
    this.parts.legLKnee = legL.knee
    this.parts.legRHip = legR.hip
    this.parts.legRKnee = legR.knee

    const armL = mkLimb(0.34, 0.3, 0.09, tracksuit, false)
    const armR = mkLimb(0.34, 0.3, 0.09, tracksuit, false)
    armL.hip.position.set(-0.36, 1.5, 0)
    armR.hip.position.set(0.36, 1.5, 0)
    root.add(armL.hip, armR.hip)
    this.parts.armLHip = armL.hip
    this.parts.armLKnee = armL.knee
    this.parts.armRHip = armR.hip
    this.parts.armRKnee = armR.knee
    // hands at the wrists
    for (const arm of [armL, armR]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), skin)
      hand.position.y = -0.32
      hand.castShadow = true
      arm.knee.add(hand)
    }

    // neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 12), skin)
    neck.position.y = 1.6
    root.add(neck)
  }

  private buildParticles() {
    const geo = new THREE.IcosahedronGeometry(0.1, 0)
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true }))
      m.visible = false
      this.scene.add(m)
      this.particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1 })
    }
  }

  private burst(pos: THREE.Vector3, color: number, count: number, spd: number, up = 0.5) {
    let placed = 0
    for (const p of this.particles) {
      if (placed >= count) break
      if (p.life > 0) continue
      placed++
      p.mesh.position.copy(pos)
      ;(p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color)
      p.mesh.visible = true
      const a = Math.random() * Math.PI * 2
      const r = (0.4 + Math.random()) * spd
      p.vel.set(Math.cos(a) * r * 0.6, (Math.random() * 0.8 + up) * spd, Math.sin(a) * r * 0.6 - 1)
      p.life = 0.45 + Math.random() * 0.4
      p.max = p.life
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      if (p.life <= 0) continue
      p.life -= dt
      if (p.life <= 0) {
        p.mesh.visible = false
        continue
      }
      p.vel.y -= 11 * dt
      p.mesh.position.addScaledVector(p.vel, dt)
      const k = p.life / p.max
      p.mesh.scale.setScalar(0.35 + 0.85 * k)
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k * 1.4)
    }
  }

  // ---------------- API ----------------
  resize(w: number, h: number, dpr: number) {
    this.vw = w
    this.vh = h
    this.renderer.setPixelRatio(Math.min(dpr, this.quality === 0 ? 1 : 2))
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.composer) {
      this.composer.setSize(w, h)
      this.bloom?.setSize(w, h)
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.sound.destroy()
    const seenGeometries = new Set<THREE.BufferGeometry>()
    const seenMaterials = new Set<THREE.Material>()
    const seenTextures = new Set<THREE.Texture>()
    disposeObject3D(this.scene, seenGeometries, seenMaterials, seenTextures)
    for (const template of Object.values(this.templates)) {
      disposeObject3D(template, seenGeometries, seenMaterials, seenTextures)
    }
    for (const pool of Object.values(this.pools)) {
      for (const mesh of pool) disposeObject3D(mesh, seenGeometries, seenMaterials, seenTextures)
    }
    this.composer?.dispose()
    this.scene.clear()
    this.renderer.renderLists.dispose()
    this.renderer.dispose()
  }

  start() {
    for (const o of this.objs) this.release(o)
    this.objs = []
    this.player = { lane: 1, displayX: 0, y: 0, vy: 0, jumping: false, sliding: false, slideT: 0 }
    this.speed = 8
    this.totalDist = 0
    this.score = 0
    this.collectScore = 0
    this.sugar = 0
    this.distSinceSpawn = 0
    this.lastFreeLane = 1
    this.revives = 0
    this.runCycle = 0
    this.speakTimer = 3
    this.speakHold = 0
    this.speakIdx = 0
    this.root.rotation.set(0, 0, 0)
    this.shake = 0
    this.seedRoad()
    this.sound.resume()
    this.cb.onSpeak(null)
    this.state = 'playing'
  }

  setMuted(m: boolean) {
    this.sound.setMuted(m)
  }
  canRevive() {
    return this.state === 'over' && this.revives < this.maxRevives
  }
  revive() {
    if (!this.canRevive()) return
    this.revives++
    // clear everything near the player so the run can resume safely
    for (let i = this.objs.length - 1; i >= 0; i--) {
      if (this.objs[i].z > -22) {
        this.release(this.objs[i])
        this.objs.splice(i, 1)
      }
    }
    this.player.lane = 1
    this.player.displayX = 0
    this.player.y = 0
    this.player.vy = 0
    this.player.jumping = false
    this.player.sliding = false
    this.player.slideT = 0
    this.sugar = Math.max(0, this.sugar - 45)
    this.root.rotation.set(0, 0, 0)
    this.shake = 0
    this.lastFreeLane = 1
    this.cb.onSpeak(null)
    this.sound.resume()
    this.state = 'playing'
  }

  pause() {
    if (this.state === 'playing') this.state = 'paused'
  }
  resume() {
    if (this.state === 'paused') {
      this.clock.getDelta() // drop the paused gap so we don't jump on resume
      this.state = 'playing'
    }
  }

  moveLane(dir: number) {
    if (this.state !== 'playing') return
    this.player.lane = Math.max(0, Math.min(2, this.player.lane + dir))
  }
  jump() {
    if (this.state !== 'playing') return
    if (this.player.sliding) {
      this.player.sliding = false
      this.player.slideT = 0
    }
    if (!this.player.jumping) {
      this.player.jumping = true
      this.player.vy = JUMP_V0
      this.sound.jump()
    }
  }
  slide() {
    if (this.state !== 'playing') return
    // slam down if airborne, then crouch-slide
    this.player.jumping = false
    this.player.vy = 0
    this.player.y = 0
    if (!this.player.sliding) this.sound.land()
    this.player.sliding = true
    this.player.slideT = 0.62
  }

  getBest() {
    return this.best
  }
  getState() {
    return this.state
  }
  getSugar() {
    return this.sugar
  }
  getLane() {
    return this.player.lane
  }
  isAirborne() {
    return this.player.y > CLEAR_H
  }
  isSliding() {
    return this.player.sliding
  }
  debugForceObstacle(type: ObjType) {
    if (this.state !== 'playing') return
    this.spawnObj(type, this.player.lane, -2)
  }
  // test-only: advance the simulation deterministically (no rendering), so
  // gameplay assertions don't depend on headless render FPS.
  debugSetDist(d: number) {
    this.totalDist = d
  }
  debugForceAt(type: ObjType, lane: number, z: number) {
    if (this.state !== 'playing') return
    this.spawnObj(type, lane, z)
  }
  debugTick(seconds: number) {
    let r = seconds
    while (r > 1e-6) {
      const s = Math.min(1 / 60, r)
      this.update(s)
      r -= s
    }
  }

  // ---------------- pooling ----------------
  private obtain(type: ObjType): THREE.Object3D {
    const pool = this.pools[type]
    const m = pool.pop() ?? this.templates[type].clone()
    m.visible = true
    this.scene.add(m)
    return m
  }
  private release(o: Obj3) {
    o.mesh.visible = false
    this.scene.remove(o.mesh)
    this.pools[o.type].push(o.mesh)
  }
  private spawnObj(type: ObjType, lane: number, z: number) {
    const mesh = this.obtain(type)
    // collectibles float; obstacles sit on the ground
    const baseY = type === 'ice' ? 1.35 : type === 'sprite' ? 1.1 : 0
    mesh.position.set(LANES[lane], baseY, z)
    mesh.rotation.set(0, 0, 0)
    this.objs.push({ type, lane, z, resolved: false, done: false, mesh })
  }

  // ---------------- spawn (fair, dense) ----------------
  private spawnRow() {
    this.spawnRowAt(SPAWN_Z)
  }

  private spawnRowAt(z: number, forceFree?: number) {
    let free: number
    if (forceFree !== undefined) {
      free = forceFree
    } else {
      const cands = [this.lastFreeLane - 1, this.lastFreeLane, this.lastFreeLane + 1].filter(
        (l) => l >= 0 && l <= 2,
      )
      free = cands[Math.floor(Math.random() * cands.length)]
    }
    for (let i = 0; i < 3; i++) {
      if (i === free) {
        const k = Math.random()
        if (k < 0.3) this.spawnObj('ice', i, z)
        else if (k < 0.55) this.spawnObj('sprite', i, z)
        continue
      }
      const k = Math.random()
      if (k < 0.28) this.spawnObj('barrier', i, z)
      else if (k < 0.46) this.spawnObj('treadmill', i, z)
      else if (k < 0.58) this.spawnObj('overhead', i, z)
      else if (k < 0.7) this.spawnObj('wall', i, z)
      else if (k < 0.86) this.spawnObj(Math.random() < 0.5 ? 'ice' : 'sprite', i, z)
    }
    this.lastFreeLane = free
  }

  // fill the visible road at the start so obstacles are immediately approaching
  private seedRoad() {
    this.lastFreeLane = 1
    let i = 0
    for (let z = -20; z > SPAWN_Z; z -= 6.5, i++) {
      // keep the first couple of rows clear in the player's lane
      this.spawnRowAt(z, i < 2 ? 1 : undefined)
    }
  }

  // ---------------- loop ----------------
  private monitorFps(dt: number) {
    this.fpsAccum += dt
    this.fpsFrames++
    if (this.fpsAccum < 1.3) return
    const fps = this.fpsFrames / this.fpsAccum
    this.fpsAccum = 0
    this.fpsFrames = 0
    if (fps >= 42 || this.quality === 0) return
    if (this.quality === 2) {
      // drop bloom first (cheapest big win)
      if (this.bloom) this.bloom.enabled = false
      this.quality = 1
    } else if (this.quality === 1) {
      // drop shadows + render at 1x
      this.sunLight.castShadow = false
      this.renderer.setPixelRatio(1)
      this.composer?.setSize(this.vw, this.vh)
      this.quality = 0
    }
  }

  private loop() {
    let dt = this.clock.getDelta()
    if (dt > 0.05) dt = 0.05
    if (this.state === 'playing') this.monitorFps(dt)
    this.update(dt)
    this.animate(dt)
    this.updateParticles(dt) // runs even on game-over so crash debris settles
    // camera shake (kept as a transient offset so it doesn't drift the base)
    const ox = this.camera.position.x
    const oy = this.camera.position.y
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt)
      const s = this.shake * 0.9
      this.camera.position.x += (Math.random() - 0.5) * s
      this.camera.position.y += (Math.random() - 0.5) * s
    }
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
    this.camera.position.x = ox
    this.camera.position.y = oy
    this.raf = requestAnimationFrame(this.loop)
  }

  private update(dt: number) {
    if (this.state === 'over' || this.state === 'paused') return
    this.time += dt
    const scroll = this.state === 'playing' ? this.speed : 7

    // scroll road texture + recycle buildings (also in menu for an idle vibe)
    const roadMat = this.road.material as THREE.MeshStandardMaterial
    // scroll the dashes at EXACTLY world speed (repeat 16 over the 260 length)
    if (roadMat.map) roadMat.map.offset.y -= scroll * dt * (16 / 260)
    for (const b of this.buildings) {
      b.mesh.position.z += scroll * dt
      if (b.mesh.position.z > 20) this.recycleBuilding(b)
    }
    this.updateProps(scroll * dt)
    this.updateSky()
    this.updateRain(dt)

    if (this.state === 'menu') {
      this.runCycle += dt * 5
      return
    }

    this.speed = Math.min(8 + this.totalDist * 0.04, 26)
    this.totalDist += this.speed * dt
    this.runCycle += dt * (6 + this.speed * 0.5)

    // lane lerp
    const targetX = LANES[this.player.lane]
    this.player.displayX += (targetX - this.player.displayX) * Math.min(1, dt * 22)

    // jump physics
    if (this.player.jumping) {
      this.player.vy -= GRAVITY * dt
      this.player.y += this.player.vy * dt
      if (this.player.y <= 0) {
        this.player.y = 0
        this.player.jumping = false
        this.player.vy = 0
        this.sound.land()
        this.burst(new THREE.Vector3(this.player.displayX, 0.1, 0), 0x9a8f86, 7, 2, 0.2)
      }
    }
    if (this.player.sliding) {
      this.player.slideT -= dt
      if (this.player.slideT <= 0) this.player.sliding = false
    }

    // sugar decay
    this.sugar = Math.max(0, this.sugar - 9 * dt)
    if (this.sugar >= 100) return this.gameOver('sugar')

    // speech
    this.speakTimer -= dt
    if (this.speakHold > 0) {
      this.speakHold -= dt
      if (this.speakHold <= 0) this.cb.onSpeak(null)
    } else if (this.speakTimer <= 0) {
      this.cb.onSpeak(SPEECH_LINES[this.speakIdx % SPEECH_LINES.length])
      this.speakIdx = this.speakIdx === 0 ? 1 : Math.random() < 0.6 ? 0 : this.speakIdx + 1
      this.speakHold = 2.6
      this.speakTimer = 6 + Math.random() * 4
    }

    // spawn (time-fair: ~0.55s between rows regardless of speed)
    this.distSinceSpawn += this.speed * dt
    const rowGap = Math.max(5.5, this.speed * 0.7)
    if (this.distSinceSpawn >= rowGap) {
      this.distSinceSpawn = 0
      this.spawnRow()
    }

    // move + collide
    const feet = this.player.y
    for (const o of this.objs) {
      o.z += this.speed * dt
      o.mesh.position.z = o.z
      if (o.type === 'sprite') {
        o.mesh.rotation.y += dt * 1.6
        o.mesh.position.y = 1.1 + Math.sin(this.time * 2.6 + o.z * 0.4) * 0.09
      } else if (o.type === 'ice') {
        // keep the bitten cut-away facing the camera: gentle sway + slight tilt
        o.mesh.rotation.set(-0.08, Math.sin(this.time * 1.4 + o.z * 0.3) * 0.4, -0.12)
        o.mesh.position.y = 1.35 + Math.sin(this.time * 2.4 + o.z * 0.4) * 0.09
      }
      if (!o.resolved && o.z >= 0) {
        o.resolved = true
        const obstacle =
          o.type === 'barrier' || o.type === 'treadmill' || o.type === 'overhead' || o.type === 'wall'
        if (obstacle && Math.abs(o.lane - this.player.lane) === 1) {
          // near miss: threaded past an obstacle one lane over
          this.collectScore += 8
          this.sound.whoosh()
          this.burst(o.mesh.position, 0xffffff, 6, 3)
        }
        if (o.lane === this.player.lane) {
          if (o.type === 'barrier' || o.type === 'treadmill') {
            // low obstacles — jump over them
            if (feet < CLEAR_H) return this.gameOver('crash')
          } else if (o.type === 'wall') {
            // tall — must switch lane (jumping/sliding won't help)
            return this.gameOver('crash')
          } else if (o.type === 'overhead') {
            if (!this.player.sliding) return this.gameOver('crash')
          } else if (o.type === 'ice') {
            if (feet < CLEAR_H) {
              this.collect(50, 15)
              this.sound.coin()
              this.burst(o.mesh.position, 0xffd27a, 16, 4)
              o.done = true
              o.mesh.visible = false
            }
          } else if (o.type === 'sprite') {
            if (feet < CLEAR_H) {
              this.collect(30, 11)
              this.sound.drink()
              this.burst(o.mesh.position, 0x7cfc9a, 16, 4)
              o.done = true
              o.mesh.visible = false
            }
          }
        }
      }
    }
    // recycle passed or consumed objects
    for (let i = this.objs.length - 1; i >= 0; i--) {
      if (this.objs[i].z > DESPAWN_Z || this.objs[i].done) {
        this.release(this.objs[i])
        this.objs.splice(i, 1)
      }
    }
    this.refreshScore()
    if (this.sugar >= 100) return this.gameOver('sugar')

    this.cb.onHud({
      score: this.score,
      distanceM: Math.floor(this.totalDist),
      speedKmh: Math.round(this.speed * KMH),
      sugar: Math.min(100, this.sugar),
    })
  }

  private collect(pts: number, sug: number) {
    this.collectScore += pts
    this.sugar = Math.min(100, this.sugar + sug)
  }

  private refreshScore() {
    this.score = Math.floor(this.totalDist) + this.collectScore
  }

  private recycleBuilding(b: Building) {
    // move to the far end of its side, randomise
    let minZ = 0
    for (const o of this.buildings) if (o.side === b.side) minZ = Math.min(minZ, o.mesh.position.z)
    const h = 7 + this.cityRng() * 34
    const w = 4 + this.cityRng() * 5
    const d = 4 + this.cityRng() * 6
    // just rescale the shared geometry — no allocation, no GC stutter
    b.mesh.scale.set(w, h, d)
    b.mesh.material = this.facadeMats[Math.floor(this.cityRng() * this.facadeMats.length)]
    b.height = h
    const x = b.side * (ROAD_HALF + 2.4 + this.cityRng() * 4 + w / 2)
    b.mesh.position.set(x, h / 2, minZ - (6 + this.cityRng() * 4))
  }

  private gameOver(reason: GameOverReason) {
    if (this.state === 'over') return
    this.refreshScore()
    this.state = 'over'
    this.shake = reason === 'crash' ? 0.5 : 0.3
    if (reason === 'crash') this.sound.crash()
    else this.sound.faint()
    this.burst(
      new THREE.Vector3(this.player.displayX, 1, 0),
      reason === 'crash' ? 0xff7a3a : 0xffd27a,
      24,
      6,
      0.8,
    )
    this.cb.onSpeak(null)
    if (this.score > this.best) {
      this.best = this.score
      localStorage.setItem('zxfrun_best', String(this.best))
    }
    this.cb.onGameOver({ reason, score: this.score, best: this.best })
  }

  // ---------------- character animation ----------------
  private animate(_dt: number) {
    const p = this.parts
    if (!p.torso) return
    if (this.state === 'paused') return
    this.root.position.x = this.player.displayX
    this.root.position.y = this.player.y

    if (this.state === 'over') {
      // crumple
      this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, -Math.PI / 2.1, 0.2)
      this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, 0.3, 0.2)
      return
    }

    const t = this.runCycle
    const air = this.player.jumping
    if (this.player.sliding) {
      // crouch-slide: lean back, knees up, low torso
      p.legLHip.rotation.x = -1.5
      p.legRHip.rotation.x = -1.5
      p.legLKnee.rotation.x = 1.7
      p.legRKnee.rotation.x = 1.7
      p.armLHip.rotation.x = -0.7
      p.armRHip.rotation.x = -0.7
      p.torso.position.y = 0.78
      this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, -0.95, 0.35)
      this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, 0, 0.2)
      this.camera.lookAt(this.player.displayX * 0.5, 1.2, -10)
      return
    }
    if (air) {
      // tucked jump pose
      p.legLHip.rotation.x = -0.9
      p.legRHip.rotation.x = -0.6
      p.legLKnee.rotation.x = 1.2
      p.legRKnee.rotation.x = 1.0
      p.armLHip.rotation.x = -2.0
      p.armRHip.rotation.x = -2.0
      p.armLKnee.rotation.x = 0.4
      p.armRKnee.rotation.x = 0.4
      p.torso.rotation.set(0.08, 0, 0)
      p.head.rotation.set(0, 0, 0)
      p.head.position.y = 1.78
      p.torso.position.y = 1.15
    } else {
      // natural run cycle
      const s = Math.sin(t)
      const s2 = Math.sin(t + Math.PI)
      const c2 = Math.cos(t * 2) // double-stride for vertical bob

      // legs: thigh swings, knee flexes hard on the forward (recovery) swing
      p.legLHip.rotation.x = s * 1.05
      p.legRHip.rotation.x = s2 * 1.05
      p.legLKnee.rotation.x = Math.max(0, s) * 1.7 + 0.14
      p.legRKnee.rotation.x = Math.max(0, s2) * 1.7 + 0.14

      // arms: opposite to legs, elbows flex through the swing
      p.armLHip.rotation.x = s2 * 0.95
      p.armRHip.rotation.x = s * 0.95
      p.armLKnee.rotation.x = 0.55 + Math.max(0, s2) * 0.6
      p.armRKnee.rotation.x = 0.55 + Math.max(0, s) * 0.6

      // torso: forward lean + shoulder counter-twist + breathing bob
      p.torso.rotation.x = 0.16
      p.torso.rotation.y = -s * 0.18
      p.torso.position.y = 1.15 - c2 * 0.03

      // head: stays roughly level (counter-twist), tiny bob
      p.head.rotation.x = -0.08
      p.head.rotation.y = s * 0.07
      p.head.position.y = 1.78 - c2 * 0.02

      // whole-body vertical bob (push-off) + subtle side sway
      this.root.position.y = this.player.y + Math.abs(s) * 0.07
      this.root.position.x = this.player.displayX + s * 0.035
    }
    // lean into lane changes (root tilt handles the lateral lean; torso handles forward lean)
    this.root.rotation.z = THREE.MathUtils.lerp(
      this.root.rotation.z,
      (LANES[this.player.lane] - this.player.displayX) * 0.14,
      0.2,
    )
    this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, 0, 0.2)

    // camera subtle follow + speed FOV ramp
    this.camera.position.x += (this.player.displayX * 0.35 - this.camera.position.x) * 0.08
    const fovTarget = 58 + Math.min(1, (this.speed - 8) / 18) * 9
    if (Math.abs(this.camera.fov - fovTarget) > 0.05) {
      this.camera.fov += (fovTarget - this.camera.fov) * 0.05
      this.camera.updateProjectionMatrix()
    }
    this.camera.lookAt(this.player.displayX * 0.5, 1.2, -10)
  }
}
