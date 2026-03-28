const video = document.getElementById("video")
const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")

const instructionEl = document.getElementById("instruction")
const scoreEl = document.getElementById("score")
const comboEl = document.getElementById("combo")
const timeEl = document.getElementById("time") // ★追加
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

// ★時間管理
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

function playSound(sound) {
  sound.currentTime = 0
  sound.play().catch(()=>{})
}

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

async function setupModel() {
  detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet
  )
}

function setBasePose(keypoints) {
  const leftHip = keypoints.find(k => k.name === "left_hip")
  const rightHip = keypoints.find(k => k.name === "right_hip")
  const leftAnkle = keypoints.find(k => k.name === "left_ankle")
  const rightAnkle = keypoints.find(k => k.name === "right_ankle")

  if (leftHip && rightHip && leftAnkle && rightAnkle) {
    basePose = {
      hipY: (leftHip.y + rightHip.y) / 2,
      ankleY: (leftAnkle.y + rightAnkle.y) / 2,
      hipX: (leftHip.x + rightHip.x) / 2
    }
  }
}

function newInstruction() {
  currentAction = actions[Math.floor(Math.random() * actions.length)]
  instructionEl.textContent = "指示: " + actionLabels[currentAction]
  judging = true
  holdStartTime = null
}

function checkPose(keypoints) {
  if (!basePose) return false

  const leftHip = keypoints.find(k => k.name === "left_hip")
  const rightHip = keypoints.find(k => k.name === "right_hip")
  const leftAnkle = keypoints.find(k => k.name === "left_ankle")
  const rightAnkle = keypoints.find(k => k.name === "right_ankle")

  if (!leftHip || !rightHip || !leftAnkle || !rightAnkle) return false

  const hipY = (leftHip.y + rightHip.y) / 2
  const ankleY = (leftAnkle.y + rightAnkle.y) / 2
  const hipX = (leftHip.x + rightHip.x) / 2

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

function checkHold(isCorrect) {
  const now = Date.now()
  if (isCorrect) {
    if (!holdStartTime) holdStartTime = now
    else if (now - holdStartTime > 300) success()
  } else {
    holdStartTime = null
  }
}

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

function nextInstructionDelay() {
  setTimeout(() => {
    if (running) newInstruction()
  }, 800)
}

// ★時間フォーマット
function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return min + ":" + (sec < 10 ? "0" : "") + sec
}

// ★カウント更新
function startTimer() {
  gameStartTime = Date.now()

  timeInterval = setInterval(() => {
    const elapsed = Date.now() - gameStartTime
    const remain = GAME_TIME - elapsed

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
  judging = false

  instructionEl.textContent = "終了！スコア: " + score

  bgm.pause()
  clearInterval(timer)
  clearInterval(timeInterval)
}

function flash(color) {
  document.body.style.background = color
  setTimeout(() => {
    document.body.style.background = "black"
  }, 120)
}

function drawGuide() {
  ctx.strokeStyle = "yellow"
  ctx.lineWidth = 2

  ctx.beginPath()
  ctx.moveTo(canvas.width / 2, 0)
  ctx.lineTo(canvas.width / 2, canvas.height)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(0, canvas.height * 0.8)
  ctx.lineTo(canvas.width, canvas.height * 0.8)
  ctx.stroke()

  ctx.fillStyle = "yellow"
  ctx.fillText("ここに立つ", canvas.width/2 - 40, canvas.height*0.8 - 10)
}

function drawKeypoints(keypoints) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  drawGuide()

  keypoints.forEach(p => {
    if (p.score > 0.4) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = "lime"
      ctx.fill()
    }
  })
}

async function gameLoop() {
  if (!running) return

  const poses = await detector.estimatePoses(video)

  if (poses[0]) {
    const keypoints = poses[0].keypoints
    drawKeypoints(keypoints)

    if (!basePose) {
      setBasePose(keypoints)
      instructionEl.textContent = "中央に立ってください"
      return
    }

    if (judging) {
      const isCorrect = checkPose(keypoints)
      checkHold(isCorrect)
    }
  }

  requestAnimationFrame(gameLoop)
}

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
  timeEl.textContent = "Time: 2:00"

  newInstruction()

  clearInterval(timer)
  timer = setInterval(() => {
    if (judging) fail()
  }, getInterval())

  startTimer() // ★ここ追加

  gameLoop()
}

startBtn.onclick = async () => {
  bgm.currentTime = 0
  bgm.volume = 0.5
  bgm.play().catch(()=>{})

  await setupCamera()
  await setupModel()

  startGame()
}
