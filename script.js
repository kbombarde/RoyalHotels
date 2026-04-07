import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js';

// ========================
const TRACK_LENGTH = 30;
const TRACK_COUNT = 10;
let SPEED = 20;

// ========================
// UI
// ========================
const scoreEl = document.getElementById('score');
const menu = document.getElementById('menu');

// ========================
// 🔊 SOUNDS
// ========================
const coinSound = new Audio('./assets/sounds/coin.mp3');
const jumpSound = new Audio('./assets/sounds/jump.mp3');
const duckSound = new Audio('./assets/sounds/duck.mp3');
const laneSound = new Audio('./assets/sounds/swish.mp3');

[coinSound, jumpSound, duckSound, laneSound].forEach(s => s.volume = 0.4);

// unlock audio
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

[groundTex, railTex].forEach(t=>{
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
});

// ========================
// SCENE
// ========================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 10, 120);

// ========================
// CAMERA
// ========================
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth/window.innerHeight,
  0.1,
  1000
);

// ========================
// RENDERER
// ========================
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('game'),
  antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);

// ========================
// LIGHT
// ========================
scene.add(new THREE.AmbientLight(0xffffff, 0.8));

// ========================
// PLAYER
// ========================
let lane = 0;
let y = 1.5;
let velocityY = 0;

let isJumping = false;
let isDucking = false;

let score = 0;
let gameOver = true;

// ========================
// CAMERA FX
// ========================
let bobTime = 0;

// ========================
// TRACK
// ========================
const track = [];

function createTrack(z){
  const g = new THREE.Group();

  groundTex.repeat.set(4,10);

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

  [-6,6].forEach(x=>{
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(1.5,2.5,TRACK_LENGTH),
      new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    wall.position.set(x,1.25,z);
    g.add(wall);
  });

  scene.add(g);
  return g;
}

for(let i=0;i<TRACK_COUNT;i++){
  track.push(createTrack(-i*TRACK_LENGTH));
}

// ========================
// PARTICLES (REFINED)
// ========================
const particles = [];

function spawnParticles(x,y,z){
  for(let i=0;i<5;i++){
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.04,6,6),
      new THREE.MeshBasicMaterial({
        color:0xffd700,
        transparent:true,
        opacity:0.9
      })
    );

    p.position.set(x,y,z);

    p.userData.velocity = {
      x:(Math.random()-0.5)*1.5,
      y:Math.random()*1.5,
      z:(Math.random()-0.5)*1.5
    };

    p.userData.life = 0.5;

    scene.add(p);
    particles.push(p);
  }
}

// ========================
// COINS
// ========================
const coins = [];

function spawnCoin(){
  const c = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8,0.8),
    new THREE.MeshBasicMaterial({ map:coinTex, transparent:true })
  );

  c.position.set(0,1.5,-60);
  c.userData.collected=false;
  c.userData.scale=1;

  scene.add(c);
  coins.push(c);
}

// ========================
// CONTROLS + SOUND
// ========================
window.addEventListener('keydown', e=>{
  if(gameOver) return;

  if(e.key==='ArrowLeft'){
    lane = Math.max(-1,lane-1);
    laneSound.currentTime=0;
    laneSound.play();
  }

  if(e.key==='ArrowRight'){
    lane = Math.min(1,lane+1);
    laneSound.currentTime=0;
    laneSound.play();
  }

  if(e.key==='ArrowUp'&&!isJumping){
    velocityY=8;
    isJumping=true;

    jumpSound.currentTime=0;
    jumpSound.play();
  }

  if(e.key==='ArrowDown'){
    isDucking=true;

    duckSound.currentTime=0;
    duckSound.play();

    setTimeout(()=>isDucking=false,400);
  }
});

// ========================
function resetGame(){
  score=0;
  gameOver=false;
}

// ========================
window.startGame = () => {
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

    // physics
    velocityY -= 20 * delta;
    y += velocityY * delta;

    if(y<=1.5){
      y=1.5;
      velocityY=0;
      isJumping=false;
    }

    // camera feel
    bobTime += delta * 10;
    const bob = Math.sin(bobTime)*0.1;

    const targetX = lane*2;

    camera.position.x += (targetX-camera.position.x)*0.2;
    camera.position.y = (isDucking?1:y) + bob;
    camera.position.z = 5;

    camera.lookAt(camera.position.x, camera.position.y-0.2, -20);
    camera.rotation.z = -lane * 0.05;

    // move world
    let farthestZ = Infinity;

    for(const t of track){
      t.position.z += SPEED*delta;
      if(t.position.z < farthestZ) farthestZ = t.position.z;
    }

    for(const t of track){
      if(t.position.z > TRACK_LENGTH){
        t.position.z = farthestZ - TRACK_LENGTH;
      }
    }

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

          coinSound.currentTime=0;
          coinSound.play();

          spawnParticles(c.position.x,c.position.y,c.position.z);

          score+=10;
          scoreEl.innerText=score;
        }
      }

      if(c.userData.collected){
        c.userData.scale+=0.1;
        c.scale.set(c.userData.scale,c.userData.scale,1);
        c.position.y+=1.5*delta;

        if(c.userData.scale>2){
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

      p.position.x+=p.userData.velocity.x*delta;
      p.position.y+=p.userData.velocity.y*delta;
      p.position.z+=p.userData.velocity.z*delta;

      p.material.opacity -= 2*delta;

      if(p.material.opacity<=0){
        scene.remove(p);
        particles.splice(i,1);
      }
    }
  }

  renderer.render(scene,camera);
}

animate();