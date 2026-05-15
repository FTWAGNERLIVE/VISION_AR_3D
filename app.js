import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

let html5QrCode = null;
let scannerRunning = false;
let scene, camera, renderer, controls;
let meshGroup = null;
let is3DActive = false;
let animFrameId = null;
let particles = null;
let mixer = null;
let clock = new THREE.Clock();

// ─── Section switching ────────────────────────────────────────────────────────
function showSection(id) {
    document.querySelectorAll('main section').forEach(s => {
        s.style.display = 'none';
    });
    const el = document.getElementById(id);
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.animation = 'fadeIn 0.5s ease-out';
}

// ─── QR Scanner ──────────────────────────────────────────────────────────────
function initScanner() {
    setStatus('Iniciando câmera...', '#94a3b8');

    if (html5QrCode) {
        // Already exists — just restart
        startScanning();
        return;
    }

    html5QrCode = new Html5Qrcode('reader');
    startScanning();
}

function startScanning() {
    if (scannerRunning) return;
    const config = { fps: 10, qrbox: { width: 240, height: 240 } };
    html5QrCode.start(
        { facingMode: 'environment' },
        config,
        onScanSuccess,
        () => { /* silent fail */ }
    ).then(() => {
        scannerRunning = true;
        setStatus('Câmera ativa — aponte para um QR Code', '#6366f1');
    }).catch(err => {
        console.warn('Camera start failed:', err);
        setStatus('Câmera não disponível. Use a demonstração abaixo.', '#f59e0b');
    });
}

function stopScanner() {
    if (!html5QrCode || !scannerRunning) return Promise.resolve();
    return html5QrCode.stop().then(() => { scannerRunning = false; }).catch(() => { scannerRunning = false; });
}

function onScanSuccess(decodedText) {
    setStatus('✓ QR Code detectado!', '#22c55e');
    stopScanner().then(() => launch3D(decodedText));
}

function setStatus(msg, color = '#6366f1') {
    const el = document.getElementById('status');
    if (el) { el.innerText = msg; el.style.color = color; }
}

// ─── 3D Engine ───────────────────────────────────────────────────────────────
function initThreeJS() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;
    controls.minDistance = 2;
    controls.maxDistance = 10;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 8, 5);
    scene.add(dirLight);
    const purpleLight = new THREE.PointLight(0x6366f1, 3, 15);
    purpleLight.position.set(-4, -2, 3);
    scene.add(purpleLight);
    const cyanLight = new THREE.PointLight(0x0ea5e9, 2, 15);
    cyanLight.position.set(4, 2, 3);
    scene.add(cyanLight);

    // Particle field
    addParticles();

    window.addEventListener('resize', onResize);
}

function addParticles() {
    const count = 300;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 30;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x6366f1, size: 0.05, transparent: true, opacity: 0.6 });
    particles = new THREE.Points(geo, mat);
    scene.add(particles);
}

function clearScene() {
    if (meshGroup) {
        scene.remove(meshGroup);
        meshGroup.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
        meshGroup = null;
    }
    mixer = null;
}

function load3DContent(data) {
    clearScene();
    meshGroup = new THREE.Group();
    scene.add(meshGroup);

    document.getElementById('info-tag').innerText = '⏳ Carregando modelo 3D...';
    document.getElementById('info-tag').style.color = '#94a3b8';

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    loader.load(
        'nugg_motion_GLB2.0.glb',
        (gltf) => {
            const model = gltf.scene;
            
            // Centralizar e ajustar escala do modelo
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 3 / maxDim; // Ajusta para caber bem na tela
            model.scale.set(scale, scale, scale);
            
            // Reposicionar para o centro
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center.multiplyScalar(scale));
            
            meshGroup.add(model);

            // Iniciar animações de forma robusta
            if (gltf.animations && gltf.animations.length) {
                console.log(`🎬 Animações detectadas: ${gltf.animations.length}`);
                mixer = new THREE.AnimationMixer(model);
                
                // Tenta tocar apenas a primeira animação (geralmente a principal)
                // Isso evita que múltiplas animações se anulem
                const action = mixer.clipAction(gltf.animations[0]);
                action.setEffectiveWeight(1.0);
                action.play();
                
                console.log(`▶️ Tocando clipe: "${gltf.animations[0].name}"`);
            } else {
                console.warn("⚠️ Nenhuma animação encontrada no arquivo GLB.");
            }

            document.getElementById('info-tag').innerText = '📦 Modelo 3D Local Ativo';
            document.getElementById('info-tag').style.color = '#6366f1';
        },
        (xhr) => {
            const percent = Math.round((xhr.loaded / xhr.total) * 100);
            if (percent) document.getElementById('info-tag').innerText = `⏳ Carregando... ${percent}%`;
        },
        (error) => {
            console.error('Erro ao carregar GLB:', error);
            document.getElementById('info-tag').innerText = '❌ Erro ao carregar model.glb';
            document.getElementById('info-tag').style.color = '#ef4444';
            buildColorBox(); // Fallback
        }
    );
}

function buildImageFrame(texture, data, isUrl) {
    const aspect = texture.image ? texture.image.width / texture.image.height : 1;
    const w = 3.2 * (aspect >= 1 ? 1 : aspect);
    const h = 3.2 * (aspect >= 1 ? 1 / aspect : 1);
    const depth = 0.12;

    // Main frame body
    const frameGeo = new THREE.BoxGeometry(w + 0.2, h + 0.2, depth);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.8 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.castShadow = true;
    meshGroup.add(frame);

    // Image plane
    const planeGeo = new THREE.PlaneGeometry(w, h);
    const planeMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.3, metalness: 0.1 });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.position.z = depth / 2 + 0.001;
    meshGroup.add(plane);

    // Glowing border
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.22, h + 0.22, depth + 0.01));
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x6366f1, linewidth: 2 });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    meshGroup.add(edges);

    // Depth "extrusion" shadow plane behind
    const shadowGeo = new THREE.PlaneGeometry(w + 0.4, h + 0.4);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.position.z = -depth / 2 - 0.3;
    meshGroup.add(shadowPlane);

    // Reflection plane underneath
    const reflGeo = new THREE.PlaneGeometry(w, h);
    const reflMat = new THREE.MeshStandardMaterial({ map: texture, transparent: true, opacity: 0.15, roughness: 1 });
    const refl = new THREE.Mesh(reflGeo, reflMat);
    refl.rotation.x = Math.PI;
    refl.position.y = -(h / 2 + 0.3);
    meshGroup.add(refl);

    document.getElementById('info-tag').innerText = isUrl ? '🖼️ Imagem 3D Ativa' : `📄 "${data.substring(0, 20)}..."`;
    document.getElementById('info-tag').style.color = '#6366f1';
}

function buildColorBox() {
    const geo = new THREE.BoxGeometry(2.5, 2.5, 0.3);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.2, metalness: 0.7 });
    const box = new THREE.Mesh(geo, mat);
    meshGroup.add(box);
    document.getElementById('info-tag').innerText = '🎲 Objeto 3D';
}

function onResize() {
    const container = document.getElementById('canvas-container');
    if (!camera || !renderer || !container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    if (!is3DActive) return;
    animFrameId = requestAnimationFrame(animate);
    controls.update();

    // Slow particle drift
    if (particles) particles.rotation.y += 0.0003;

    // Atualizar animação do modelo
    if (mixer) {
        mixer.update(clock.getDelta());
    }

    renderer.render(scene, camera);
}

// ─── Orchestration ───────────────────────────────────────────────────────────
function launch3D(data) {
    showSection('viewer-section');
    is3DActive = true;

    if (!scene) initThreeJS();
    load3DContent(data);
    animate();
}

function goBack() {
    is3DActive = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
    showSection('scanner-section');
    setStatus('Câmera iniciando...', '#94a3b8');
    setTimeout(() => initScanner(), 300);
}

// ─── Buttons ─────────────────────────────────────────────────────────────────
document.getElementById('back-btn').addEventListener('click', goBack);

document.getElementById('demo-btn').addEventListener('click', () => {
    stopScanner().finally(() => {
        launch3D('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80');
    });
});

window.simulateScan = launch3D;

// ─── Init ────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
    // Show scanner section on load with explicit style
    showSection('scanner-section');
    initScanner();
});
