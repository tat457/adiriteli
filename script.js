const video = document.getElementById("video")
const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d")

const instructionEl = document.getElementById("instruction")
const scoreEl = document.getElementById("score")
const comboEl = document.getElementById("combo")
const timeEl = document.getElementById("time")

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

let baseHip = null
let baseAnkle = null

const GAME_TIME = 120000
let gameStartTime = 0
let timeInterval = null

const actions = ["jump","squat","left","right"]

function conf(p){ return p?.score ?? p?.confidence ?? 0 }

// ===== カメラ =====
async function setupCamera(){
  const stream = await navigator.mediaDevices.getUserMedia({video:true})
  video.srcObject = stream

  return new Promise(resolve=>{
    video.onloadedmetadata = ()=>{
      // ★これで黒バグ完全回避
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
  const lHip = kp.find(p=>p.name==="left_hip")
  const rHip = kp.find(p=>p.name==="right_hip")
  const lAnk = kp.find(p=>p.name==="left_ankle")
  const rAnk = kp.find(p=>p.name==="right_ankle")

  if(lHip && rHip && conf(lHip)>0.3 && conf(rHip)>0.3){
    baseHip = {
      x:(lHip.x+rHip.x)/2,
      y:(lHip.y+rHip.y)/2
    }
  }

  if(lAnk && rAnk && conf(lAnk)>0.3 && conf(rAnk)>0.3){
    baseAnkle = (lAnk.y+rAnk.y)/2
  }
}

// ===== 指示 =====
function newInstruction(){
  currentAction = actions[Math.floor(Math.random()*actions.length)]
  instructionEl.textContent = "指示"
  judging = true
  holdStartTime = null
}

// ===== 判定 =====
function checkPose(kp){
  if(!baseHip) return false

  const lHip = kp.find(p=>p.name==="left_hip")
  const rHip = kp.find(p=>p.name==="right_hip")
  const lAnk = kp.find(p=>p.name==="left_ankle")
  const rAnk = kp.find(p=>p.name==="right_ankle")

  if(!lHip || !rHip) return false

  const hipX=(lHip.x+rHip.x)/2
  const hipY=(lHip.y+rHip.y)/2

  const moveX=hipX-baseHip.x
  const moveY=hipY-baseHip.y

  const ankleY = (lAnk && rAnk) ? (lAnk.y+rAnk.y)/2 : null

  switch(currentAction){
    case "jump":
      return ankleY && baseAnkle && (baseAnkle - ankleY > 50)
    case "squat":
      return moveY > 50
    case "left":
      return moveX < -60
    case "right":
      return moveX > 60
  }
}

// ===== 0.3秒 =====
function checkHold(ok){
  const now = Date.now()
  if(ok){
    if(!holdStartTime) holdStartTime = now
    else if(now - holdStartTime > 300) success()
  }else{
    holdStartTime = null
  }
}

// ===== 成功失敗 =====
function success(){
  judging=false
  combo++
  score+=10*combo
  scoreEl.textContent="Score:"+score
  comboEl.textContent="Combo:"+combo
  instructionEl.textContent="成功"
  seikaiSound.play()
  setTimeout(newInstruction,800)
}

function fail(){
  judging=false
  combo=0
  comboEl.textContent="Combo:0"
  instructionEl.textContent="失敗"
  huseikaiSound.play()
  setTimeout(newInstruction,800)
}

// ===== 時間 =====
function formatTime(ms){
  const s=Math.ceil(ms/1000)
  const m=Math.floor(s/60)
  const ss=s%60
  return m+":"+(ss<10?"0":"")+ss
}

function startTimer(){
  gameStartTime=Date.now()
  timeInterval=setInterval(()=>{
    const remain=GAME_TIME-(Date.now()-gameStartTime)
    if(remain<=0){
      timeEl.textContent="Time:0:00"
      endGame()
    }else{
      timeEl.textContent="Time:"+formatTime(remain)
    }
  },1000)
}

function endGame(){
  running=false
  instructionEl.textContent="終了！スコア:"+score
  bgm.pause()
  clearInterval(timeInterval)
}

// ===== 描画（ズレ完全修正）=====
function draw(kp){
  ctx.clearRect(0,0,canvas.width,canvas.height)

  const scaleX = canvas.width / video.videoWidth
  const scaleY = canvas.height / video.videoHeight

  kp.forEach(p=>{
    const c=conf(p)
    if(c>0.3){
      ctx.beginPath()
      ctx.arc(p.x*scaleX,p.y*scaleY,6,0,Math.PI*2)
      ctx.fillStyle="lime"
      ctx.fill()
    }
  })
}

// ===== ループ =====
async function loop(){
  if(!running) return

  const poses = await detector.estimatePoses(video)

  if(poses[0]){
    const kp = poses[0].keypoints

    draw(kp)
    setBasePose(kp)

    if(!baseHip){
      instructionEl.textContent="中央に立つ（全身）"
      return
    }

    if(judging){
      checkHold(checkPose(kp))
    }
  }

  requestAnimationFrame(loop)
}

// ===== スタート =====
document.getElementById("startBtn").onclick=async()=>{
  bgm.play().catch(()=>{})
  await setupCamera()
  await setupModel()

  running=true
  score=0
  combo=0
  baseHip=null
  baseAnkle=null

  scoreEl.textContent="Score:0"
  comboEl.textContent="Combo:0"

  newInstruction()
  startTimer()
  loop()
}
