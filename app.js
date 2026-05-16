// Variáveis Globais
let scene, camera, renderer, clock, mixer;
let arToolkitSource, arToolkitContext;
let markerRoot;

window.addEventListener('load', () => {
    init();
    animate();
});

function init() {
    // 1. Setup Básico do Three.js
    scene = new THREE.Scene();

    let ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);
    
    let directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);

    camera = new THREE.Camera();
    scene.add(camera);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true // Fundo transparente para ver a câmera
    });
    renderer.setClearColor(new THREE.Color('lightgrey'), 0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0px';
    renderer.domElement.style.left = '0px';
    renderer.domElement.id = 'ar-canvas';
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    // 2. Setup do AR.js (Source: Câmera)
    arToolkitSource = new THREEx.ArToolkitSource({
        sourceType: 'webcam',
    });

    arToolkitSource.init(function onReady() {
        onResize();
    });

    window.addEventListener('resize', function() {
        onResize();
    });

    function onResize() {
        arToolkitSource.onResizeElement();
        arToolkitSource.copyElementSizeTo(renderer.domElement);
        if (arToolkitContext && arToolkitContext.arController !== null) {
            arToolkitSource.copyElementSizeTo(arToolkitContext.arController.canvas);
        }
    }

    // 3. Setup do Contexto de Tracking do AR.js
    // Patch para consertar o erro "this.dispatchEvent is not a function"
    if (THREEx.ArToolkitContext && !THREEx.ArToolkitContext.prototype.dispatchEvent) {
        Object.assign(THREEx.ArToolkitContext.prototype, THREE.EventDispatcher.prototype);
    }

    arToolkitContext = new THREEx.ArToolkitContext({
        cameraParametersUrl: 'https://raw.githack.com/AR-js-org/AR.js/master/data/data/camera_para.dat',
        detectionMode: 'mono'
    });

    arToolkitContext.init(function onCompleted() {
        camera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
    });

    // 4. Configurar o Marcador (Hiro)
    markerRoot = new THREE.Group();
    scene.add(markerRoot);

    if (THREEx.ArMarkerControls && !THREEx.ArMarkerControls.prototype.dispatchEvent) {
        Object.assign(THREEx.ArMarkerControls.prototype, THREE.EventDispatcher.prototype);
    }

    new THREEx.ArMarkerControls(arToolkitContext, markerRoot, {
        type: 'pattern',
        patternUrl: 'hiro.patt',
        smooth: true,
        smoothCount: 5,
        smoothTolerance: 0.05,
        smoothThreshold: 2
    });

    // 5. Carregar o Modelo GLB
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        'nugg_motion_GLB2.0.glb', // Certifique-se de que o arquivo está na raiz
        function (gltf) {
            const model = gltf.scene;
            
            // Ajustar escala e posição. 1 = 1 unidade do Hiro marker.
            model.scale.set(0.8, 0.8, 0.8);
            model.position.y = 0; // Tocar no chão do marcador
            model.rotation.x = -Math.PI / 2; // Rotação padrão necessária para muitos GLBs no AR.js

            // Prevenir bugs de desaparecimento ("frustum culling" problem)
            model.traverse(function(node) {
                if (node.isMesh) {
                    node.frustumCulled = false;
                    node.castShadow = true;
                }
            });

            // Adicionar ao marcador
            markerRoot.add(model);

            // Iniciar animação se houver
            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(model);
                const action = mixer.clipAction(gltf.animations[0]);
                action.play();
            }

            // Esconder Loading Screen
            const loadingScreen = document.getElementById('loading-screen');
            if(loadingScreen) {
                loadingScreen.style.opacity = '0';
                setTimeout(() => loadingScreen.style.display = 'none', 500);
            }
        },
        function (xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function (error) {
            console.error('Um erro ocorreu ao carregar o modelo', error);
            alert('Falha ao carregar o modelo 3D. Verifique o console.');
        }
    );
}

function update() {
    if (arToolkitSource.ready !== false) {
        arToolkitContext.update(arToolkitSource.domElement);
    }
    
    // Atualizar UI Status baseado na visibilidade (Workaround pois AR.js events as vezes falham)
    if (markerRoot.visible) {
        const status = document.getElementById('tracking-status');
        if(status.classList.contains('searching')) {
            status.className = 'ar-status found';
            document.getElementById('status-text').innerText = 'Marcador Encontrado!';
        }
    } else {
        const status = document.getElementById('tracking-status');
        if(status.classList.contains('found')) {
            status.className = 'ar-status searching';
            document.getElementById('status-text').innerText = 'Buscando Marcador...';
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    if (mixer) {
        mixer.update(delta);
    }
    
    update();
    renderer.render(scene, camera);
}
