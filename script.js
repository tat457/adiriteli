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
let basePose = null

const actions = ["jump", "squat", "left", "right"]

const actionLabels = {
  jump: "ジャンプ",
  squat: "しゃがむ",
  left: "左",
  right: "右"
}

// ★信頼度取得（重要）
function conf(p){
  return p?.score ?? p?.confidence ?? 0
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

// ===== 基準 =====
function setBasePose(keypoints) {
  const hip = keypoints.find(k => k.name === "left_hip")
  const ankle = keypoints.find(k => k.name === "left_ankle")

  if (hip && ankle && conf(hip) > 0.3) {
    basePose = {
      hipY: hip.y,
      ankleY: ankle.y,
      hipX: hip.x
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

// ===== 判定（少しゆるめ）=====
function checkPose(keypoints) {
  if (!basePose) return false

  const hip = keypoints.find(k => k.name === "left_hip")
  const ankle = keypoints.find(k => k.name === "left_ankle")

  if (!hip) return false

  const hipMoveY = hip.y - basePose.hipY
  const hipMoveX = hip.x - basePose.hipX

  let ankleMove = 0
  if (ankle) ankleMove = basePose.ankleY - ankle.y

  switch (currentAction) {
    case "jump":
      return ankleMove > 30 || hipMoveY < -30

    case "squat":
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
  combo++
  score += 10 * combo

  scoreEl.textContent = "Score: " + score
  comboEl.textContent = "Combo: " + combo

  instructionEl.textContent = "成功"
  playSound(seikaiSound)

  setTimeout(newInstruction, 800)
}

// ===== 失敗 =====
function fail() {
  judging = false
  combo = 0
  comboEl.textContent = "Combo: 0"

  instructionEl.textContent = "失敗"
  playSound(huseikaiSound)

  setTimeout(newInstruction, 800)
}

// ===== 音 =====
function playSound(sound) {
  sound.currentTime = 0
  sound.play().catch(()=>{})
}

// ===== 描画（完全修正）=====
function drawKeypoints(keypoints) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const scaleX = canvas.width / video.videoWidth
  const scaleY = canvas.height / video.videoHeight

  keypoints.forEach(p => {
    const c = conf(p)

    // ★ここが超重要（0.2に緩和）
    if (c > 0.2) {
      ctx.beginPath()
      ctx.arc(p.x * scaleX, p.y * scaleY, 6, 0, Math.PI * 2)
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

    if (!basePose) {
      setBasePose(keypoints)
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
  basePose = null

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
