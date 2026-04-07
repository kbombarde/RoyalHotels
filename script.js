import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js';

// ========================
const TRACK_LENGTH = 30;
const TRACK_COUNT = 10;

let SPEED = 18;
let LEVEL = 1;

// UI
const scoreEl = document.getElementById('score');
const menu = document.getElementById('menu');

// 🔊 SOUND (FIXED)
const coinSound = new Audio('./assets/sounds/coin.mp3');
coinSound.volume = 0.5;

// unlock sound (IMPORTANT)
window.addEventListener('click', () => {
  coinSound.play().then(()=>coinSound.pause()).catch(()=>{});
}, { once: true });

// ========================
// TEXTURES
// ========================
const loader = new THREE.TextureLoader();

const groundTex = loader.load('./assets/textures/ground.png');
const railTex = loader.load('./assets/textures/rail.png');
const coinTex = loader.load('./assets/textures/coin.png');
const bushTex = loader.load('./assets/textures/bush.png');

[groundTex, railTex].forEach(t => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
});

// ========================
// SCENE
// ========================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('game'),
  antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);

scene.add(new THREE.AmbientLight(0xffffff, 1));

// ========================
// PLAYER
// ========================
let lane = 0, y = 1.5, velocityY = 0;
let isJumping = false, isDucking = false;
let score = 0, gameOver = true;

// ========================
// TRACK
// ========================
const track = [];

function createTrack(z){
  const g = new THREE.Group();

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(12,0.2,TRACK_LENGTH),
    new THREE.MeshStandardMaterial({ map: groundTex })
  );
  ground.position.set(0,0,z);
  g.add(ground);

  [-2,0,2].forEach(x=>{
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.25,0.25,TRACK_LENGTH),
      new THREE.MeshStandardMaterial({ map: railTex })
    );
    rail.position.set(x,0.15,z);
    g.add(rail);
  });

  scene.add(g);
  return g;
}

for(let i=0;i<TRACK_COUNT;i++){
  track.push(createTrack(-i*TRACK_LENGTH));
}

// ========================
// PARTICLES (FIXED)
// ========================
const particles = [];

function spawnParticles(x, y, z){
  for(let i=0;i<12;i++){

    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8), // bigger
      new THREE.MeshBasicMaterial({ color: 0xffd700 })
    );

    p.position.set(x,y,z);

    p.userData.velocity = {
      x:(Math.random()-0.5)*6,
      y:Math.random()*4,
      z:(Math.random()-0.5)*6
    };

    p.userData.life = 1.2;

    scene.add(p);
    particles.push(p);
  }
}

// ========================
// COINS
// ========================
const coins = [];

function spawnCoin(){

  const x = (LEVEL===1) ? 0 : [-2,0,2][Math.random()*3|0];

  const c = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8,0.8),
    new THREE.MeshBasicMaterial({ map:coinTex, transparent:true })
  );

  c.position.set(x,1.5,-60);
  c.userData.collected=false;
  c.userData.scale=1;

  scene.add(c);
  coins.push(c);
}

// ========================
// CONTROLS
// ========================
window.addEventListener('keydown', e=>{
  if(gameOver) return;

  if(e.key==='ArrowLeft') lane=Math.max(-1,lane-1);
  if(e.key==='ArrowRight') lane=Math.min(1,lane+1);

  if(e.key==='ArrowUp'&&!isJumping){
    velocityY=8;
    isJumping=true;
  }

  if(e.key==='ArrowDown'){
    isDucking=true;
    setTimeout(()=>isDucking=false,400);
  }
});

// ========================
function resetGame(){
  score=0;
  gameOver=false;
  SPEED=18;
}

// ========================
window.startGame = () => {
  LEVEL = parseInt(document.getElementById('level').value);
  menu.style.display = 'none';
  resetGame();
};

// ========================
// LOOP
// ========================
const clock=new THREE.Clock();
let coinTimer=0;

function animate(){
  requestAnimationFrame(animate);
  const delta=clock.getDelta();

  if(!gameOver){

    score+=Math.floor(delta*100);
    scoreEl.innerText=score;

    velocityY-=20*delta;
    y+=velocityY*delta;

    if(y<=1.5){
      y=1.5;
      velocityY=0;
      isJumping=false;
    }

    const targetX=lane*2;

    camera.position.x+=(targetX-camera.position.x)*0.2;
    camera.position.y=isDucking?1:y;
    camera.position.z=5;

    camera.lookAt(camera.position.x,camera.position.y,-25);

    // spawn coins
    coinTimer+=delta;
    if(coinTimer>0.6){
      spawnCoin();
      coinTimer=0;
    }

    // coins
    for(let i=coins.length-1;i>=0;i--){
      const c=coins[i];

      c.lookAt(camera.position);
      c.position.z+=SPEED*delta;

      if(!c.userData.collected){
        const hit =
          Math.abs(c.position.z-camera.position.z)<1 &&
          Math.abs(c.position.x-camera.position.x)<1;

        if(hit){
          c.userData.collected=true;

          // 🔊 SOUND
          coinSound.currentTime=0;
          coinSound.play().catch(()=>{});

          // ✨ PARTICLES
          spawnParticles(c.position.x, c.position.y, c.position.z);

          score+=10;
        }
      }

      if(c.userData.collected){
        c.userData.scale+=0.2;
        c.scale.set(c.userData.scale,c.userData.scale,1);
        c.position.y+=3*delta;

        if(c.userData.scale>2.5){
          scene.remove(c);
          coins.splice(i,1);
        }
      }

      if(c.position.z>10){
        scene.remove(c);
        coins.splice(i,1);
      }
    }

    // particles
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];

      p.position.x += p.userData.velocity.x * delta;
      p.position.y += p.userData.velocity.y * delta;
      p.position.z += p.userData.velocity.z * delta;

      p.userData.life -= delta;

      if(p.userData.life <= 0){
        scene.remove(p);
        particles.splice(i,1);
      }
    }
  }

  renderer.render(scene,camera);
}

animate();