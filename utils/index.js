function getRandomInt(min = 1, max = 3) {
  return Math.floor(Math.random() * (max - min) + min)
}

function log(...messages){
  for(let i = 0; i < messages.length; i++) {
    if(Array.isArray(messages[i])) {
      console.log(...messages[i])
    } else {
      console.log(`[DEBUG MODE] [訊息]: ${messages[i]}`)
    }
  }
}

module.exports = {
  getRandomInt,
  log
}