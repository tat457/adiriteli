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

let holdStartTime = null // ★ここ重要

const actions = ["jump", "squat", "left", "right"]

const actionLabels = {
  jump: "ジャンプ",
  squat: "しゃがむ",
  left: "左",
  right: "右"
}

// 音
function playSound(sound) {
  sound.currentTime = 0
  sound.play().catch(()=>{})
}

// カメラ
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

// モデル
async function setupModel() {
  detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet
  )
}

// 指示
function newInstruction() {
  currentAction = actions[Math.floor(Math.random() * actions.length)]
  instructionEl.textContent = "指示: " + actionLabels[currentAction]
  judging = true
  holdStartTime = null // リセット
}

// 判定（厳しめ）
function checkPose(keypoints) {
  const nose = keypoints.find(k => k.name === "nose")
  const leftAnkle = keypoints.find(k => k.name === "left_ankle")
  const rightAnkle = keypoints.find(k => k.name === "right_ankle")
  const leftHip = keypoints.find(k => k.name === "left_hip")

  if (!nose || !leftAnkle || !rightAnkle || !leftHip) return false

  switch (currentAction) {
    case "jump":
      return (nose.y - leftAnkle.y) > 80

    case "squat":
      return (leftHip.y - nose.y) > 60

    case "left":
      return (rightAnkle.x - leftAnkle.x) > 120

    case "right":
      return (rightAnkle.x - leftAnkle.x) > 120
  }
}

// ★0.3秒維持判定
function checkHold(isCorrect) {
  const now = Date.now()

  if (isCorrect) {
    if (!holdStartTime) {
      holdStartTime = now
    } else if (now - holdStartTime > 300) {
      success()
    }
  } else {
    holdStartTime = null
  }
}

// 成功
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

// 失敗
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

// インターバル
function nextInstructionDelay() {
  setTimeout(() => {
    if (running) newInstruction()
  }, 800)
}

// エフェクト
function flash(color) {
  document.body.style.background = color
  setTimeout(() => {
    document.body.style.background = "black"
  }, 120)
}

// 描画
function drawKeypoints(keypoints) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  keypoints.forEach(p => {
    if (p.score > 0.4) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = "lime"
      ctx.fill()
    }
  })
}

// ループ
async function gameLoop() {
  if (!running) return

  const poses = await detector.estimatePoses(video)

  if (poses[0] && judging) {
    const keypoints = poses[0].keypoints
    drawKeypoints(keypoints)

    const isCorrect = checkPose(keypoints)
    checkHold(isCorrect)
  }

  requestAnimationFrame(gameLoop)
}

// 難易度
function getInterval() {
  const diff = difficultySelect.value
  if (diff === "easy") return 2500
  if (diff === "normal") return 1800
  return 1200
}

// タイマー
let timer

function startGame() {
  score = 0
  combo = 0
  running = true

  scoreEl.textContent = "Score: 0"
  comboEl.textContent = "Combo: 0"

  newInstruction()

  clearInterval(timer)
  timer = setInterval(() => {
    if (judging) fail()
  }, getInterval())

  gameLoop()
}

// 初期化
startBtn.onclick = async () => {
  bgm.volume = 0.5
  bgm.play().catch(()=>{})

  await setupCamera()
  await setupModel()

  startGame()
}
