const video = document.getElementById("video")
const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")

const instructionEl = document.getElementById("instruction")
const scoreEl = document.getElementById("score")
const comboEl = document.getElementById("combo")
const startBtn = document.getElementById("startBtn")
const difficultySelect = document.getElementById("difficulty")

const bgm = document.getElementById("bgm")
const seikaiSound = document.getElementById("seikaiSound")
const huseikaiSound = document.getElementById("huseikaiSound")

let detector
let running = false
let judging = false

let score = 0
let combo = 0
let currentAction = ""

let holdStartTime = null

// ★基準姿勢
let baseHipY = null
let baseHipX = null
let baseAnkleY = null

const actions = ["jump", "squat", "left", "right"]

const actionLabels = {
  jump: "ジャンプ",
  squat: "しゃがむ",
  left: "左",
  right: "右"
}

function conf(p){
  return p?.score ?? p?.confidence ?? 0
}

// ===== 音 =====
function playSound(sound) {
  sound.currentTime = 0
  sound.play().catch(()=>{})
}

// ===== カメラ =====
async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true })
  video.srcObject = stream

  return new Promise(resolve => {
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      resolve()
    }
  })
}

// ===== モデル =====
async function setupModel() {
  detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet
  )
}

// ===== 基準取得 =====
function setBasePose(keypoints) {
  const hip = keypoints.find(k => k.name === "left_hip")
  const ankle = keypoints.find(k => k.name === "left_ankle")

  if (hip && conf(hip) > 0.3) {
    if (baseHipY === null) baseHipY = hip.y
    if (baseHipX === null) baseHipX = hip.x
  }

  if (ankle && conf(ankle) > 0.3) {
    if (baseAnkleY === null) baseAnkleY = ankle.y
  }
}

// ===== 指示 =====
function newInstruction() {
  currentAction = actions[Math.floor(Math.random() * actions.length)]
  instructionEl.textContent = "指示: " + actionLabels[currentAction]
  judging = true
  holdStartTime = null
}

// ===== 判定（完全修正版）=====
function checkPose(keypoints) {
  if (baseHipY === null) return false

  const hip = keypoints.find(k => k.name === "left_hip")
  const ankle = keypoints.find(k => k.name === "left_ankle")

  if (!hip) return false

  const hipMoveY = hip.y - baseHipY
  const hipMoveX = hip.x - baseHipX

  let ankleMove = 0
  if (ankle && baseAnkleY !== null) {
    ankleMove = baseAnkleY - ankle.y
  }

  switch (currentAction) {
    case "jump":
      // 上に動く（値は小さくなる）
      return ankleMove > 30 || hipMoveY < -30

    case "squat":
      // 下に動く
      return hipMoveY > 30

    case "left":
      return hipMoveX < -40

    case "right":
      return hipMoveX > 40
  }
}

// ===== 0.3秒維持 =====
function checkHold(ok) {
  const now = Date.now()

  if (ok) {
    if (!holdStartTime) holdStartTime = now
    else if (now - holdStartTime > 300) success()
  } else {
    holdStartTime = null
  }
}

// ===== 成功 =====
function success() {
  judging = false
  holdStartTime = null

  combo++
  score += 10 * combo

  scoreEl.textContent = "Score: " + score
  comboEl.textContent = "Combo: " + combo

  instructionEl.textContent = "成功"
  flash("green")
  playSound(seikaiSound)

  nextInstructionDelay()
}

// ===== 失敗 =====
function fail() {
  judging = false
  holdStartTime = null

  combo = 0
  comboEl.textContent = "Combo: 0"

  instructionEl.textContent = "失敗"
  flash("red")
  playSound(huseikaiSound)

  nextInstructionDelay()
}

// ===== 次の指示 =====
function nextInstructionDelay() {
  setTimeout(() => {
    if (running) newInstruction()
  }, 800)
}

// ===== エフェクト =====
function flash(color) {
  document.body.style.background = color
  setTimeout(() => {
    document.body.style.background = "black"
  }, 120)
}

// ===== 描画 =====
function drawKeypoints(keypoints) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  keypoints.forEach(p => {
    if (conf(p) > 0.2) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
      ctx.fillStyle = "lime"
      ctx.fill()
    }
  })
}

// ===== ループ =====
async function gameLoop() {
  if (!running) return

  const poses = await detector.estimatePoses(video)

  if (poses[0]) {
    const keypoints = poses[0].keypoints

    drawKeypoints(keypoints)
    setBasePose(keypoints)

    if (baseHipY === null) {
      instructionEl.textContent = "そのまま立ってください"
      return
    }

    if (judging) {
      checkHold(checkPose(keypoints))
    }
  }

  requestAnimationFrame(gameLoop)
}

// ===== 難易度 =====
function getInterval() {
  const diff = difficultySelect.value
  if (diff === "easy") return 2500
  if (diff === "normal") return 1800
  return 1200
}

let timer

function startGame() {
  score = 0
  combo = 0
  running = true

  baseHipY = null
  baseHipX = null
  baseAnkleY = null

  scoreEl.textContent = "Score: 0"
  comboEl.textContent = "Combo: 0"

  newInstruction()

  clearInterval(timer)
  timer = setInterval(() => {
    if (judging) fail()
  }, getInterval())

  gameLoop()
}

// ===== スタート =====
startBtn.onclick = async () => {
  bgm.volume = 0.5
  bgm.play().catch(()=>{})

  await setupCamera()
  await setupModel()

  startGame()
}
