// ★ここだけ変更でなく全体最適化済み

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

  // ★足が無い場合も対応
  let ankleMove = 0
  if(lAnk && rAnk && baseAnkle){
    const ankleY=(lAnk.y+rAnk.y)/2
    ankleMove = baseAnkle - ankleY
  }

  switch(currentAction){
    case "jump":
      // ★腰でもジャンプ判定OKにする
      return ankleMove > 30 || moveY < -30

    case "squat":
      return moveY > 30

    case "left":
      return moveX < -40

    case "right":
      return moveX > 40
  }
}

function checkHold(ok){
  console.log("判定:", currentAction, ok) // ★追加

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
