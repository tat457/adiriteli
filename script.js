const video = document.getElementById("video")
const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")

const instructionEl = document.getElementById("instruction")
const scoreEl = document.getElementById("score")
const comboEl = document.getElementById("combo")
const startBtn = document.getElementById("startBtn")
const difficultySelect = document.getElementById("difficulty")

let detector
let running = false

let score = 0
let combo = 0
let currentAction = ""

const actions = ["jump", "squat", "left", "right"]

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

// 指示生成
function newInstruction() {
  currentAction = actions[Math.floor(Math.random() * actions.length)]
  instructionEl.textContent = "指示: " + currentAction
}

// 判定
function checkPose(keypoints) {
  const nose = keypoints.find(k => k.name === "nose")
  const leftAnkle = keypoints.find(k => k.name === "left_ankle")
  const rightAnkle = keypoints.find(k => k.name === "right_ankle")
  const leftHip = keypoints.find(k => k.name === "left_hip")

  if (!nose || !leftAnkle || !rightAnkle || !leftHip) return false

  switch (currentAction) {
    case "jump":
      return leftAnkle.y < nose.y

    case "squat":
      return leftHip.y > nose.y

    case "left":
      return leftAnkle.x < rightAnkle.x - 50

    case "right":
      return rightAnkle.x > leftAnkle.x + 50
  }
}

// 難易度
function getInterval() {
  const diff = difficultySelect.value
  if (diff === "easy") return 2000
  if (diff === "normal") return 1400
  return 900
}

// スコア処理
function success() {
  combo++
  score += 10 * combo
  scoreEl.textContent = "Score: " + score
  comboEl.textContent = "Combo: " + combo

  instructionEl.textContent = "成功！"
  flash("green")
}

function fail() {
  combo = 0
  comboEl.textContent = "Combo: 0"
  instructionEl.textContent = "ミス！"
  flash("red")
}

// エフェクト
function flash(color) {
  document.body.style.background = color
  setTimeout(() => {
    document.body.style.background = "black"
  }, 150)
}

// 描画
function drawKeypoints(keypoints) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  keypoints.forEach(p => {
    if (p.score > 0.3) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = "lime"
      ctx.fill()
    }
  })
}

// メインループ
async function gameLoop() {
  if (!running) return

  const poses = await detector.estimatePoses(video)

  if (poses[0]) {
    const keypoints = poses[0].keypoints
    drawKeypoints(keypoints)

    if (checkPose(keypoints)) {
      success()
      newInstruction()
    }
  }

  requestAnimationFrame(gameLoop)
}

// タイマー制御
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
    fail()
    newInstruction()
  }, getInterval())

  gameLoop()
}

// 初期化
startBtn.onclick = async () => {
  await setupCamera()
  await setupModel()
  startGame()
}
