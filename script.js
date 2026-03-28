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
let isTransition = false   // ★インターバル中フラグ

let score = 0
let combo = 0
let currentAction = ""
let holdStartTime = null

let baseHipY = null
let baseHipX = null
let baseAnkleY = null

const actions = ["jump","squat","left","right"]

const actionLabels = {
  jump: "ジャンプ",
  squat: "しゃがむ",
  left: "左",
  right: "右"
}

// ★keypoints index
const KP = {
  LEFT_HIP: 11,
  RIGHT_HIP: 12,
  LEFT_ANKLE: 15,
  RIGHT_ANKLE: 16
}

function conf(p){
  return p?.score ?? p?.confidence ?? 0
}

// ===== 音 =====
function playSound(sound){
  sound.currentTime = 0
  sound.play().catch(()=>{})
}

// ===== カメラ =====
async function setupCamera(){
  const stream = await navigator.mediaDevices.getUserMedia({video:true})
  video.srcObject = stream

  return new Promise(resolve=>{
    video.onloadedmetadata = ()=>{
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      resolve()
    }
  })
}

// ===== モデル =====
async function setupModel(){
  detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet
  )
}

// ===== 基準 =====
function setBasePose(kp){
  const lHip = kp[KP.LEFT_HIP]
  const rHip = kp[KP.RIGHT_HIP]
  const lAnk = kp[KP.LEFT_ANKLE]
  const rAnk = kp[KP.RIGHT_ANKLE]

  if(lHip && rHip && conf(lHip)>0.3 && conf(rHip)>0.3){
    const hipY = (lHip.y + rHip.y)/2
    const hipX = (lHip.x + rHip.x)/2

    if(baseHipY===null) baseHipY = hipY
    if(baseHipX===null) baseHipX = hipX
  }

  if(lAnk && rAnk && conf(lAnk)>0.3 && conf(rAnk)>0.3){
    const ankleY = (lAnk.y + rAnk.y)/2
    if(baseAnkleY===null) baseAnkleY = ankleY
  }
}

// ===== 指示 =====
function newInstruction(){
  currentAction = actions[Math.floor(Math.random()*actions.length)]
  instructionEl.textContent = "指示: " + actionLabels[currentAction]

  judging = true
  holdStartTime = null
  isTransition = false
}

// ===== 判定 =====
function checkPose(kp){
  if(baseHipY===null) return false

  const lHip = kp[KP.LEFT_HIP]
  const rHip = kp[KP.RIGHT_HIP]
  const lAnk = kp[KP.LEFT_ANKLE]
  const rAnk = kp[KP.RIGHT_ANKLE]

  if(!lHip || !rHip) return false

  const hipY = (lHip.y + rHip.y)/2
  const hipX = (lHip.x + rHip.x)/2

  const hipMoveY = hipY - baseHipY
  const hipMoveX = hipX - baseHipX

  let ankleMove = 0
  if(lAnk && rAnk && baseAnkleY!==null){
    const ankleY = (lAnk.y + rAnk.y)/2
    ankleMove = baseAnkleY - ankleY
  }

  switch(currentAction){
    case "jump": return ankleMove > 30 || hipMoveY < -30
    case "squat": return hipMoveY > 30
    case "left": return hipMoveX > 40
    case "right": return hipMoveX < -40
  }
}

// ===== 0.3秒維持 =====
function checkHold(ok){
  const now = Date.now()

  if(ok){
    if(!holdStartTime) holdStartTime = now
    else if(now - holdStartTime > 300){
      success()
    }
  } else {
    holdStartTime = null
  }
}

// ===== 成功 =====
function success(){
  if(isTransition) return

  judging = false
  isTransition = true

  combo++
  score += 10 * combo

  scoreEl.textContent = "Score: " + score
  comboEl.textContent = "Combo: " + combo

  instructionEl.textContent = "成功"
  playSound(seikaiSound)

  setTimeout(()=>{
    if(running) newInstruction()
  }, 1000) // ★1秒インターバル
}

// ===== 失敗 =====
function fail(){
  if(isTransition) return

  judging = false
  isTransition = true

  combo = 0
  comboEl.textContent = "Combo: 0"

  instructionEl.textContent = "失敗"
  playSound(huseikaiSound)

  setTimeout(()=>{
    if(running) newInstruction()
  }, 1000) // ★1秒インターバル
}

// ===== 描画 =====
function drawKeypoints(kp){
  ctx.clearRect(0,0,canvas.width,canvas.height)

  kp.forEach(p=>{
    if(conf(p)>0.2){
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6, 0, Math.PI*2)
      ctx.fillStyle="lime"
      ctx.fill()
    }
  })
}

// ===== ループ =====
async function gameLoop(){
  if(!running) return

  const poses = await detector.estimatePoses(video)

  if(poses[0]){
    const kp = poses[0].keypoints

    drawKeypoints(kp)
    setBasePose(kp)

    if(baseHipY===null){
      instructionEl.textContent="そのまま立つ"
      return
    }

    if(judging && !isTransition){
      checkHold(checkPose(kp))
    }
  }

  requestAnimationFrame(gameLoop)
}

// ===== 難易度 =====
function getInterval(){
  const diff = difficultySelect.value
  if(diff==="easy") return 2500
  if(diff==="normal") return 1800
  return 1200
}

let timer

function startGame(){
  score=0
  combo=0
  running=true

  baseHipY=null
  baseHipX=null
  baseAnkleY=null

  scoreEl.textContent="Score: 0"
  comboEl.textContent="Combo: 0"

  newInstruction()

  clearInterval(timer)
  timer=setInterval(()=>{
    if(judging && !isTransition) fail()
  }, getInterval())

  gameLoop()
}

// ===== スタート =====
startBtn.onclick = async ()=>{
  bgm.volume=0.5
  bgm.play().catch(()=>{})

  await setupCamera()
  await setupModel()

  startGame()
}
