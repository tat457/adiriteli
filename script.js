const video = document.getElementById("video")
const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")

const instructionEl = document.getElementById("instruction")
const scoreEl = document.getElementById("score")
const comboEl = document.getElementById("combo")
const timeEl = document.getElementById("time")
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
let basePose = null

const GAME_TIME = 120000
let gameStartTime = 0
let timeInterval = null

const actions = ["jump", "squat", "left", "right"]

const actionLabels = {
  jump: "ジャンプ",
  squat: "しゃがむ",
  left: "左",
  right: "右"
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

// ===== 基準姿勢 =====
function setBasePose(keypoints) {
  const lHip = keypoints.find(k => k.name === "left_hip")
  const rHip = keypoints.find(k => k.name === "right_hip")
  const lAnk = keypoints.find(k => k.name === "left_ankle")
  const rAnk = keypoints.find(k => k.name === "right_ankle")

  if (lHip && rHip && lAnk && rAnk) {
    basePose = {
      hipY: (lHip.y + rHip.y) / 2,
      ankleY: (lAnk.y + rAnk.y) / 2,
      hipX: (lHip.x + rHip.x) / 2
    }
  }
}

// ===== 指示 =====
function newInstruction() {
  currentAction = actions[Math.floor(Math.random() * actions.length)]
  instructionEl.textContent = "指示: " + actionLabels[currentAction]
  judging = true
  holdStartTime = null
}

// ===== 判定 =====
function checkPose(keypoints) {
  if (!basePose) return false

  const lHip = keypoints.find(k => k.name === "left_hip")
  const rHip = keypoints.find(k => k.name === "right_hip")
  const lAnk = keypoints.find(k => k.name === "left_ankle")
  const rAnk = keypoints.find(k => k.name === "right_ankle")

  if (!lHip || !rHip || !lAnk || !rAnk) return false

  const hipY = (lHip.y + rHip.y) / 2
  const ankleY = (lAnk.y + rAnk.y) / 2
  const hipX = (lHip.x + rHip.x) / 2

  const hipMoveY = hipY - basePose.hipY
  const ankleMoveY = basePose.ankleY - ankleY
  const hipMoveX = hipX - basePose.hipX

  switch (currentAction) {
    case "jump": return ankleMoveY > 60
    case "squat": return hipMoveY > 60
    case "left": return hipMoveX < -70
    case "right": return hipMoveX > 70
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

// ===== 成功 / 失敗 =====
function success() {
  judging = false
  combo++
  score += 10 * combo
  scoreEl.textContent = "Score: " + score
  comboEl.textContent = "Combo: " + combo
  instructionEl.textContent = "成功"
  playSound(seikaiSound)
  setTimeout(newInstruction, 800)
}

function fail() {
  judging = false
  combo = 0
  comboEl.textContent = "Combo: 0"
  instructionEl.textContent = "失敗"
  playSound(huseikaiSound)
  setTimeout(newInstruction, 800)
}

// ===== 時間 =====
function formatTime(ms) {
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  const ss = s % 60
  return m + ":" + (ss < 10 ? "0" : "") + ss
}

function startTimer() {
  gameStartTime = Date.now()
  timeInterval = setInterval(() => {
    const remain = GAME_TIME - (Date.now() - gameStartTime)
    if (remain <= 0) {
      timeEl.textContent = "Time: 0:00"
      endGame()
    } else {
      timeEl.textContent = "Time: " + formatTime(remain)
    }
  }, 1000)
}

function endGame() {
  running = false
  instructionEl.textContent = "終了！スコア: " + score
  bgm.pause()
  clearInterval(timeInterval)
}

// ===== 骨格線 =====
function drawSkeleton(kp) {
  const pairs = [
    ["left_shoulder","right_shoulder"],
    ["left_shoulder","left_elbow"],
    ["left_elbow","left_wrist"],
    ["right_shoulder","right_elbow"],
    ["right_elbow","right_wrist"],
    ["left_hip","right_hip"],
    ["left_shoulder","left_hip"],
    ["right_shoulder","right_hip"],
    ["left_hip","left_knee"],
    ["left_knee","left_ankle"],
    ["right_hip","right_knee"],
    ["right_knee","right_ankle"]
  ]

  ctx.strokeStyle = "lime"
  ctx.lineWidth = 2

  pairs.forEach(([a,b])=>{
    const p1 = kp.find(p=>p.name===a)
    const p2 = kp.find(p=>p.name===b)
    if (!p1 || !p2) return

    const c1 = p1.score ?? p1.confidence ?? 0
    const c2 = p2.score ?? p2.confidence ?? 0

    if (c1 > 0.3 && c2 > 0.3) {
      ctx.beginPath()
      ctx.moveTo(p1.x,p1.y)
      ctx.lineTo(p2.x,p2.y)
      ctx.stroke()
    }
  })
}

// ===== 点描画（修正版） =====
function drawKeypoints(keypoints) {
  ctx.clearRect(0,0,canvas.width,canvas.height)

  drawGuide()

  keypoints.forEach(p=>{
    const conf = p.score ?? p.confidence ?? 0
    if (conf > 0.3) {
      ctx.beginPath()
      ctx.arc(p.x,p.y,6,0,Math.PI*2)
      ctx.fillStyle="lime"
      ctx.fill()
    }
  })

  drawSkeleton(keypoints)
}

// ===== ガイド =====
function drawGuide() {
  ctx.strokeStyle="yellow"
  ctx.beginPath()
  ctx.moveTo(canvas.width/2,0)
  ctx.lineTo(canvas.width/2,canvas.height)
  ctx.stroke()
}

// ===== ループ =====
async function gameLoop() {
  if (!running) return

  const poses = await detector.estimatePoses(video)

  if (poses[0]) {
    const kp = poses[0].keypoints
    drawKeypoints(kp)

    if (!basePose) {
      setBasePose(kp)
      instructionEl.textContent="中央に立ってください"
      return
    }

    if (judging) {
      checkHold(checkPose(kp))
    }
  }

  requestAnimationFrame(gameLoop)
}

// ===== スタート =====
startBtn.onclick = async () => {
  bgm.play().catch(()=>{})
  await setupCamera()
  await setupModel()

  running = true
  score = 0
  combo = 0
  basePose = null

  scoreEl.textContent="Score: 0"
  comboEl.textContent="Combo: 0"

  newInstruction()
  startTimer()
  gameLoop()
}
