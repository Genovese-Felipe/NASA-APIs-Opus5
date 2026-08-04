import { storageGet, storageSet } from './storage';

export const languageNames = {
  en: 'English',
  'pt-BR': 'Português',
  es: 'Español',
  'zh-CN': '简体中文',
  ko: '한국어',
  fr: 'Français',
  ja: '日本語',
  de: 'Deutsch',
  ar: 'العربية',
} as const;

export type Language = keyof typeof languageNames;

const en = {
  missionControl: 'Mission control',
  appSubtitle: 'Live computational observatory',
  dataStreams: 'data streams',
  live: 'Live',
  cache: 'Cached',
  demo: 'Demo',
  loading: 'Acquiring signal',
  unavailable: 'Unavailable',
  modes: 'Observatory modes',
  orbit: 'Deep orbit',
  orbitDesc: 'Ray-traced worlds, APOD context, and free-flight navigation.',
  earth: 'Living Earth',
  earthDesc: 'EPIC full-disc observations and active EONET events.',
  neo: 'Near-Earth watch',
  neoDesc: 'Close approaches rendered as a data-driven orbital swarm.',
  helio: 'Heliophysics',
  helioDesc: 'Solar flares and CMEs translated into light and sound.',
  archive: 'NASA archive',
  archiveDesc: 'Search NASA’s image, video, and audio record.',
  quality: 'Image quality',
  auto: 'Auto',
  low: 'Low',
  balanced: 'Balanced',
  high: 'High',
  ultra: 'Ultra',
  orbitMode: 'Orbit mode',
  speed: 'Speed',
  tilt: 'Inclination',
  sound: 'Sonification',
  record: 'Record',
  stop: 'Stop',
  export: 'Export',
  exportStudio: 'Export studio',
  format: 'Format',
  resolution: 'Resolution',
  viewport: 'Viewport',
  fourK: '4K UHD',
  eightK: '8K UHD',
  download: 'Render & download',
  exporting: 'Rendering native-resolution frame…',
  recording: 'Recording observatory canvas',
  apiKey: 'NASA API key',
  apiKeyHint: 'Optional. DEMO_KEY works with strict limits; a personal key remains in this browser session only.',
  apply: 'Apply',
  refreshData: 'Refresh live data',
  telemetry: 'Telemetry',
  apiHealth: 'API health & provenance',
  sourcePolicy: 'Source policy',
  openDocs: 'Official documentation',
  archived: 'Archived',
  referenceOnly: 'Reference only',
  browserReady: 'Browser-ready',
  search: 'Search',
  searchPlaceholder: 'Moon, Webb, black hole, Artemis…',
  noResults: 'No archive results yet.',
  about: 'About this mission',
  aboutText: 'OPUS 5 turns verified NASA data into an explorable instrument. Visuals are computational; source status is always visible.',
  help: 'Controls',
  helpText: 'Drag or use arrow keys to look around. Wheel or pinch to zoom. O toggles orbit, Space pauses, E exports, and R records.',
  reducedMotion: 'Reduce motion',
  language: 'Language',
  close: 'Close',
  selected: 'Selected signal',
  diameter: 'Diameter',
  velocity: 'Relative velocity',
  missDistance: 'Miss distance',
  hazardous: 'Potentially hazardous',
  activeEvents: 'Active Earth events',
  solarEvents: 'Recent solar events',
  dataTimestamp: 'Data timestamp',
  fallbackNotice: 'Live data is unavailable. The renderer is using a clearly marked deterministic demonstration signal.',
  liveNotice: 'Connected to official NASA data.',
  privacy: 'No analytics. No account. API keys are never committed or transmitted anywhere except NASA.',
  credits: 'Independent educational project. Not an official NASA product.',
  capabilityWarning: 'This device cannot safely encode the requested frame. Choose a lower resolution.',
  recorderFallback: 'MP4 is not available in this browser; recording will use WebM.',
  copied: 'Link copied',
} as const;

export type TranslationKey = keyof typeof en;
type Dictionary = Record<TranslationKey, string>;

const ptBR: Dictionary = {
  missionControl: 'Controle da missão', appSubtitle: 'Observatório computacional ao vivo', dataStreams: 'fluxos de dados', live: 'Ao vivo', cache: 'Em cache', demo: 'Demonstração', loading: 'Adquirindo sinal', unavailable: 'Indisponível', modes: 'Modos do observatório',
  orbit: 'Órbita profunda', orbitDesc: 'Mundos traçados por raios, contexto do APOD e navegação livre.', earth: 'Terra viva', earthDesc: 'Observações de disco completo do EPIC e eventos ativos do EONET.', neo: 'Vigilância próxima à Terra', neoDesc: 'Aproximações renderizadas como um enxame orbital orientado por dados.', helio: 'Heliofísica', helioDesc: 'Erupções solares e CMEs traduzidas em luz e som.', archive: 'Arquivo NASA', archiveDesc: 'Pesquise o acervo de imagem, vídeo e áudio da NASA.',
  quality: 'Qualidade de imagem', auto: 'Automática', low: 'Baixa', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra', orbitMode: 'Modo órbita', speed: 'Velocidade', tilt: 'Inclinação', sound: 'Sonificação', record: 'Gravar', stop: 'Parar', export: 'Exportar', exportStudio: 'Estúdio de exportação', format: 'Formato', resolution: 'Resolução', viewport: 'Tela atual', fourK: '4K UHD', eightK: '8K UHD', download: 'Renderizar e baixar', exporting: 'Renderizando quadro em resolução nativa…', recording: 'Gravando o canvas do observatório',
  apiKey: 'Chave da API NASA', apiKeyHint: 'Opcional. DEMO_KEY funciona com limites rígidos; uma chave pessoal permanece apenas nesta sessão do navegador.', apply: 'Aplicar', refreshData: 'Atualizar dados ao vivo', telemetry: 'Telemetria', apiHealth: 'Saúde e proveniência das APIs', sourcePolicy: 'Política da fonte', openDocs: 'Documentação oficial', archived: 'Arquivada', referenceOnly: 'Somente referência', browserReady: 'Pronta para navegador',
  search: 'Pesquisar', searchPlaceholder: 'Lua, Webb, buraco negro, Artemis…', noResults: 'Ainda não há resultados do arquivo.', about: 'Sobre esta missão', aboutText: 'O OPUS 5 transforma dados verificados da NASA em um instrumento explorável. Os visuais são computacionais; o estado da fonte está sempre visível.', help: 'Controles', helpText: 'Arraste ou use as setas para olhar ao redor. Role ou pince para ampliar. O alterna órbita, Espaço pausa, E exporta e R grava.', reducedMotion: 'Reduzir movimento', language: 'Idioma', close: 'Fechar', selected: 'Sinal selecionado', diameter: 'Diâmetro', velocity: 'Velocidade relativa', missDistance: 'Distância de passagem', hazardous: 'Potencialmente perigoso', activeEvents: 'Eventos ativos na Terra', solarEvents: 'Eventos solares recentes', dataTimestamp: 'Data dos dados', fallbackNotice: 'Os dados ao vivo estão indisponíveis. O renderizador usa um sinal demonstrativo determinístico e claramente identificado.', liveNotice: 'Conectado a dados oficiais da NASA.', privacy: 'Sem analytics. Sem conta. Chaves nunca são salvas no código nem enviadas para fora da NASA.', credits: 'Projeto educacional independente. Não é um produto oficial da NASA.', capabilityWarning: 'Este dispositivo não consegue codificar esse quadro com segurança. Escolha uma resolução menor.', recorderFallback: 'MP4 não está disponível neste navegador; a gravação usará WebM.', copied: 'Link copiado',
};

const es: Dictionary = {
  missionControl: 'Control de misión', appSubtitle: 'Observatorio computacional en vivo', dataStreams: 'flujos de datos', live: 'En vivo', cache: 'En caché', demo: 'Demostración', loading: 'Adquiriendo señal', unavailable: 'No disponible', modes: 'Modos del observatorio', orbit: 'Órbita profunda', orbitDesc: 'Mundos trazados por rayos, contexto APOD y navegación libre.', earth: 'Tierra viva', earthDesc: 'Observaciones EPIC del disco terrestre y eventos activos EONET.', neo: 'Vigilancia cercana', neoDesc: 'Aproximaciones representadas como un enjambre orbital guiado por datos.', helio: 'Heliofísica', helioDesc: 'Erupciones solares y CME traducidas en luz y sonido.', archive: 'Archivo NASA', archiveDesc: 'Busca en el registro de imágenes, vídeo y audio de NASA.', quality: 'Calidad de imagen', auto: 'Auto', low: 'Baja', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra', orbitMode: 'Modo órbita', speed: 'Velocidad', tilt: 'Inclinación', sound: 'Sonificación', record: 'Grabar', stop: 'Detener', export: 'Exportar', exportStudio: 'Estudio de exportación', format: 'Formato', resolution: 'Resolución', viewport: 'Vista actual', fourK: '4K UHD', eightK: '8K UHD', download: 'Renderizar y descargar', exporting: 'Renderizando cuadro en resolución nativa…', recording: 'Grabando el lienzo del observatorio', apiKey: 'Clave API de NASA', apiKeyHint: 'Opcional. DEMO_KEY tiene límites estrictos; una clave personal permanece solo en esta sesión.', apply: 'Aplicar', refreshData: 'Actualizar datos en vivo', telemetry: 'Telemetría', apiHealth: 'Estado y procedencia de APIs', sourcePolicy: 'Política de fuente', openDocs: 'Documentación oficial', archived: 'Archivada', referenceOnly: 'Solo referencia', browserReady: 'Lista para navegador', search: 'Buscar', searchPlaceholder: 'Luna, Webb, agujero negro, Artemis…', noResults: 'Todavía no hay resultados.', about: 'Acerca de esta misión', aboutText: 'OPUS 5 convierte datos verificados de NASA en un instrumento explorable. Los visuales son computacionales y el estado de la fuente siempre es visible.', help: 'Controles', helpText: 'Arrastra o usa las flechas para mirar. Rueda o pellizca para ampliar. O activa órbita, Espacio pausa, E exporta y R graba.', reducedMotion: 'Reducir movimiento', language: 'Idioma', close: 'Cerrar', selected: 'Señal seleccionada', diameter: 'Diámetro', velocity: 'Velocidad relativa', missDistance: 'Distancia de paso', hazardous: 'Potencialmente peligroso', activeEvents: 'Eventos terrestres activos', solarEvents: 'Eventos solares recientes', dataTimestamp: 'Fecha de datos', fallbackNotice: 'Los datos en vivo no están disponibles. El renderizador usa una señal de demostración determinista y marcada.', liveNotice: 'Conectado a datos oficiales de NASA.', privacy: 'Sin analítica. Sin cuenta. Las claves solo se transmiten a NASA.', credits: 'Proyecto educativo independiente. No es un producto oficial de NASA.', capabilityWarning: 'Este dispositivo no puede codificar ese cuadro con seguridad. Elige una resolución menor.', recorderFallback: 'MP4 no está disponible; la grabación usará WebM.', copied: 'Enlace copiado',
};

const fr: Dictionary = {
  missionControl: 'Contrôle de mission', appSubtitle: 'Observatoire computationnel en direct', dataStreams: 'flux de données', live: 'Direct', cache: 'Cache', demo: 'Démo', loading: 'Acquisition du signal', unavailable: 'Indisponible', modes: 'Modes de l’observatoire', orbit: 'Orbite profonde', orbitDesc: 'Mondes tracés par rayons, contexte APOD et navigation libre.', earth: 'Terre vivante', earthDesc: 'Observations EPIC du globe et événements EONET actifs.', neo: 'Veille géocroiseurs', neoDesc: 'Approches rapprochées sous forme d’essaim orbital piloté par les données.', helio: 'Héliophysique', helioDesc: 'Éruptions solaires et CME traduites en lumière et en son.', archive: 'Archives NASA', archiveDesc: 'Recherchez dans les images, vidéos et sons de la NASA.', quality: 'Qualité d’image', auto: 'Auto', low: 'Faible', balanced: 'Équilibrée', high: 'Élevée', ultra: 'Ultra', orbitMode: 'Mode orbite', speed: 'Vitesse', tilt: 'Inclinaison', sound: 'Sonification', record: 'Enregistrer', stop: 'Arrêter', export: 'Exporter', exportStudio: 'Studio d’export', format: 'Format', resolution: 'Résolution', viewport: 'Vue actuelle', fourK: '4K UHD', eightK: '8K UHD', download: 'Rendre et télécharger', exporting: 'Rendu en résolution native…', recording: 'Enregistrement du canevas', apiKey: 'Clé API NASA', apiKeyHint: 'Facultatif. DEMO_KEY est très limité ; une clé personnelle reste uniquement dans cette session.', apply: 'Appliquer', refreshData: 'Actualiser les données', telemetry: 'Télémétrie', apiHealth: 'État et provenance des API', sourcePolicy: 'Politique de source', openDocs: 'Documentation officielle', archived: 'Archivée', referenceOnly: 'Référence uniquement', browserReady: 'Compatible navigateur', search: 'Rechercher', searchPlaceholder: 'Lune, Webb, trou noir, Artemis…', noResults: 'Aucun résultat pour le moment.', about: 'À propos de cette mission', aboutText: 'OPUS 5 transforme des données NASA vérifiées en instrument explorable. Les visuels sont calculés et l’état des sources reste visible.', help: 'Commandes', helpText: 'Faites glisser ou utilisez les flèches. Molette ou pincement pour zoomer. O active l’orbite, Espace met en pause, E exporte et R enregistre.', reducedMotion: 'Réduire les animations', language: 'Langue', close: 'Fermer', selected: 'Signal sélectionné', diameter: 'Diamètre', velocity: 'Vitesse relative', missDistance: 'Distance de passage', hazardous: 'Potentiellement dangereux', activeEvents: 'Événements terrestres actifs', solarEvents: 'Événements solaires récents', dataTimestamp: 'Horodatage', fallbackNotice: 'Les données en direct sont indisponibles. Le rendu utilise un signal de démonstration déterministe clairement indiqué.', liveNotice: 'Connecté aux données officielles de la NASA.', privacy: 'Aucune analyse. Aucun compte. Les clés ne sont transmises qu’à la NASA.', credits: 'Projet éducatif indépendant. Ce n’est pas un produit officiel de la NASA.', capabilityWarning: 'Cet appareil ne peut pas encoder cette image en toute sécurité. Choisissez une résolution inférieure.', recorderFallback: 'MP4 indisponible ; l’enregistrement utilisera WebM.', copied: 'Lien copié',
};

const de: Dictionary = {
  missionControl: 'Missionskontrolle', appSubtitle: 'Live-Computational-Observatorium', dataStreams: 'Datenströme', live: 'Live', cache: 'Cache', demo: 'Demo', loading: 'Signal wird empfangen', unavailable: 'Nicht verfügbar', modes: 'Observatoriumsmodi', orbit: 'Tiefe Umlaufbahn', orbitDesc: 'Raytracing-Welten, APOD-Kontext und freie Navigation.', earth: 'Lebendige Erde', earthDesc: 'EPIC-Gesamtaufnahmen und aktive EONET-Ereignisse.', neo: 'Erdnähe-Wache', neoDesc: 'Nahe Begegnungen als datengesteuerter Orbitalschwarm.', helio: 'Heliophysik', helioDesc: 'Sonneneruptionen und CMEs als Licht und Klang.', archive: 'NASA-Archiv', archiveDesc: 'NASA-Bilder, Videos und Audio durchsuchen.', quality: 'Bildqualität', auto: 'Auto', low: 'Niedrig', balanced: 'Ausgewogen', high: 'Hoch', ultra: 'Ultra', orbitMode: 'Orbit-Modus', speed: 'Geschwindigkeit', tilt: 'Neigung', sound: 'Sonifikation', record: 'Aufnehmen', stop: 'Stoppen', export: 'Export', exportStudio: 'Exportstudio', format: 'Format', resolution: 'Auflösung', viewport: 'Aktuelle Ansicht', fourK: '4K UHD', eightK: '8K UHD', download: 'Rendern & herunterladen', exporting: 'Frame in nativer Auflösung wird gerendert…', recording: 'Observatorium wird aufgenommen', apiKey: 'NASA-API-Schlüssel', apiKeyHint: 'Optional. DEMO_KEY ist streng limitiert; ein persönlicher Schlüssel bleibt nur in dieser Sitzung.', apply: 'Anwenden', refreshData: 'Live-Daten aktualisieren', telemetry: 'Telemetrie', apiHealth: 'API-Status & Herkunft', sourcePolicy: 'Quellenrichtlinie', openDocs: 'Offizielle Dokumentation', archived: 'Archiviert', referenceOnly: 'Nur Referenz', browserReady: 'Browserfähig', search: 'Suchen', searchPlaceholder: 'Mond, Webb, Schwarzes Loch, Artemis…', noResults: 'Noch keine Archivergebnisse.', about: 'Über diese Mission', aboutText: 'OPUS 5 macht verifizierte NASA-Daten zu einem erforschbaren Instrument. Visuals werden berechnet; der Quellenstatus bleibt sichtbar.', help: 'Steuerung', helpText: 'Ziehen oder Pfeiltasten zum Umschauen. Mausrad oder Pinch zum Zoomen. O Orbit, Leertaste Pause, E Export, R Aufnahme.', reducedMotion: 'Bewegung reduzieren', language: 'Sprache', close: 'Schließen', selected: 'Ausgewähltes Signal', diameter: 'Durchmesser', velocity: 'Relative Geschwindigkeit', missDistance: 'Vorbeiflugdistanz', hazardous: 'Potenziell gefährlich', activeEvents: 'Aktive Erdereignisse', solarEvents: 'Jüngste Sonnenereignisse', dataTimestamp: 'Datenzeitpunkt', fallbackNotice: 'Live-Daten sind nicht verfügbar. Der Renderer verwendet ein klar markiertes deterministisches Demosignal.', liveNotice: 'Mit offiziellen NASA-Daten verbunden.', privacy: 'Keine Analytik. Kein Konto. Schlüssel werden nur an NASA übertragen.', credits: 'Unabhängiges Bildungsprojekt. Kein offizielles NASA-Produkt.', capabilityWarning: 'Dieses Gerät kann den Frame nicht sicher kodieren. Wähle eine niedrigere Auflösung.', recorderFallback: 'MP4 ist nicht verfügbar; WebM wird verwendet.', copied: 'Link kopiert',
};

const zhCN: Dictionary = {
  missionControl: '任务控制', appSubtitle: '实时计算观测站', dataStreams: '数据流', live: '实时', cache: '缓存', demo: '演示', loading: '正在获取信号', unavailable: '不可用', modes: '观测模式', orbit: '深空轨道', orbitDesc: '光线追踪世界、APOD 背景与自由飞行导航。', earth: '活力地球', earthDesc: 'EPIC 地球全景与 EONET 活动事件。', neo: '近地天体监测', neoDesc: '将近距离飞掠呈现为数据驱动的轨道群。', helio: '日球物理', helioDesc: '把太阳耀斑与日冕物质抛射转化为光与声音。', archive: 'NASA 档案', archiveDesc: '搜索 NASA 的图像、视频和音频记录。', quality: '图像质量', auto: '自动', low: '低', balanced: '均衡', high: '高', ultra: '超高', orbitMode: '轨道模式', speed: '速度', tilt: '倾角', sound: '数据声化', record: '录制', stop: '停止', export: '导出', exportStudio: '导出工作室', format: '格式', resolution: '分辨率', viewport: '当前视图', fourK: '4K UHD', eightK: '8K UHD', download: '渲染并下载', exporting: '正在以原生分辨率渲染…', recording: '正在录制观测画布', apiKey: 'NASA API 密钥', apiKeyHint: '可选。DEMO_KEY 限制严格；个人密钥只保留在本次浏览器会话。', apply: '应用', refreshData: '刷新实时数据', telemetry: '遥测', apiHealth: 'API 状态与来源', sourcePolicy: '来源政策', openDocs: '官方文档', archived: '已归档', referenceOnly: '仅供参考', browserReady: '浏览器可用', search: '搜索', searchPlaceholder: '月球、韦布、黑洞、阿耳忒弥斯…', noResults: '暂无档案结果。', about: '关于本任务', aboutText: 'OPUS 5 将经核验的 NASA 数据转化为可探索仪器。视觉由计算生成，来源状态始终可见。', help: '控制', helpText: '拖动或使用方向键观察，滚轮或双指缩放。O 切换轨道，空格暂停，E 导出，R 录制。', reducedMotion: '减少动态效果', language: '语言', close: '关闭', selected: '已选信号', diameter: '直径', velocity: '相对速度', missDistance: '掠过距离', hazardous: '潜在危险', activeEvents: '地球活动事件', solarEvents: '近期太阳事件', dataTimestamp: '数据时间', fallbackNotice: '实时数据不可用。渲染器正在使用明确标注的确定性演示信号。', liveNotice: '已连接 NASA 官方数据。', privacy: '无分析、无账户。密钥只发送给 NASA。', credits: '独立教育项目，并非 NASA 官方产品。', capabilityWarning: '此设备无法安全编码该画面，请选择较低分辨率。', recorderFallback: '此浏览器不支持 MP4，将使用 WebM。', copied: '链接已复制',
};

const ko: Dictionary = {
  missionControl: '미션 컨트롤', appSubtitle: '실시간 컴퓨테이셔널 관측소', dataStreams: '데이터 스트림', live: '실시간', cache: '캐시', demo: '데모', loading: '신호 수신 중', unavailable: '사용 불가', modes: '관측 모드', orbit: '심우주 궤도', orbitDesc: '레이 트레이싱 세계, APOD 맥락, 자유 비행 탐색.', earth: '살아있는 지구', earthDesc: 'EPIC 지구 전면 관측과 활성 EONET 이벤트.', neo: '근지구 감시', neoDesc: '근접 통과를 데이터 기반 궤도 군집으로 시각화합니다.', helio: '태양권 물리학', helioDesc: '태양 플레어와 CME를 빛과 소리로 변환합니다.', archive: 'NASA 아카이브', archiveDesc: 'NASA 이미지, 영상, 오디오 기록을 검색합니다.', quality: '이미지 품질', auto: '자동', low: '낮음', balanced: '균형', high: '높음', ultra: '울트라', orbitMode: '궤도 모드', speed: '속도', tilt: '기울기', sound: '소니피케이션', record: '녹화', stop: '중지', export: '내보내기', exportStudio: '내보내기 스튜디오', format: '형식', resolution: '해상도', viewport: '현재 화면', fourK: '4K UHD', eightK: '8K UHD', download: '렌더링 및 다운로드', exporting: '원본 해상도 프레임 렌더링 중…', recording: '관측소 캔버스 녹화 중', apiKey: 'NASA API 키', apiKeyHint: '선택 사항. DEMO_KEY는 제한이 엄격하며 개인 키는 이 브라우저 세션에만 남습니다.', apply: '적용', refreshData: '실시간 데이터 새로고침', telemetry: '텔레메트리', apiHealth: 'API 상태 및 출처', sourcePolicy: '소스 정책', openDocs: '공식 문서', archived: '보관됨', referenceOnly: '참조 전용', browserReady: '브라우저 지원', search: '검색', searchPlaceholder: '달, 웹, 블랙홀, 아르테미스…', noResults: '아직 검색 결과가 없습니다.', about: '이 미션 소개', aboutText: 'OPUS 5는 검증된 NASA 데이터를 탐색 가능한 기기로 바꿉니다. 시각은 계산되며 출처 상태가 항상 표시됩니다.', help: '조작법', helpText: '드래그하거나 방향키로 둘러보고 휠 또는 핀치로 확대합니다. O는 궤도, Space는 일시정지, E는 내보내기, R은 녹화입니다.', reducedMotion: '모션 줄이기', language: '언어', close: '닫기', selected: '선택된 신호', diameter: '지름', velocity: '상대 속도', missDistance: '통과 거리', hazardous: '잠재적 위험', activeEvents: '활성 지구 이벤트', solarEvents: '최근 태양 이벤트', dataTimestamp: '데이터 시각', fallbackNotice: '실시간 데이터를 사용할 수 없어 명확히 표시된 결정론적 데모 신호를 사용합니다.', liveNotice: 'NASA 공식 데이터에 연결됨.', privacy: '분석 없음, 계정 없음. 키는 NASA 이외로 전송되지 않습니다.', credits: '독립 교육 프로젝트이며 NASA 공식 제품이 아닙니다.', capabilityWarning: '이 기기는 요청한 프레임을 안전하게 인코딩할 수 없습니다. 더 낮은 해상도를 선택하세요.', recorderFallback: 'MP4를 지원하지 않아 WebM으로 녹화합니다.', copied: '링크 복사됨',
};

const ja: Dictionary = {
  missionControl: 'ミッションコントロール', appSubtitle: 'ライブ計算観測所', dataStreams: 'データストリーム', live: 'ライブ', cache: 'キャッシュ', demo: 'デモ', loading: '信号取得中', unavailable: '利用不可', modes: '観測モード', orbit: '深宇宙軌道', orbitDesc: 'レイトレーシングされた世界、APOD、自由飛行ナビゲーション。', earth: '生きている地球', earthDesc: 'EPIC の全球観測と EONET の活動中イベント。', neo: '地球近傍監視', neoDesc: '接近天体をデータ駆動の軌道群として描画。', helio: '太陽圏物理', helioDesc: '太陽フレアと CME を光と音へ変換。', archive: 'NASA アーカイブ', archiveDesc: 'NASA の画像・映像・音声記録を検索。', quality: '画質', auto: '自動', low: '低', balanced: 'バランス', high: '高', ultra: 'ウルトラ', orbitMode: '軌道モード', speed: '速度', tilt: '傾斜', sound: 'ソニフィケーション', record: '録画', stop: '停止', export: '書き出し', exportStudio: '書き出しスタジオ', format: '形式', resolution: '解像度', viewport: '現在の表示', fourK: '4K UHD', eightK: '8K UHD', download: 'レンダーして保存', exporting: 'ネイティブ解像度でレンダリング中…', recording: '観測キャンバスを録画中', apiKey: 'NASA API キー', apiKeyHint: '任意。DEMO_KEY は厳しい制限があります。個人キーはこのセッションにのみ保持されます。', apply: '適用', refreshData: 'ライブデータ更新', telemetry: 'テレメトリ', apiHealth: 'API 状態と出典', sourcePolicy: 'ソースポリシー', openDocs: '公式ドキュメント', archived: 'アーカイブ済み', referenceOnly: '参照のみ', browserReady: 'ブラウザ対応', search: '検索', searchPlaceholder: '月、ウェッブ、ブラックホール、アルテミス…', noResults: 'まだ結果がありません。', about: 'このミッションについて', aboutText: 'OPUS 5 は検証済み NASA データを探索可能な計器へ変換します。映像は計算され、出典状態は常に表示されます。', help: '操作', helpText: 'ドラッグまたは矢印キーで視点移動。ホイールまたはピンチでズーム。O は軌道、Space は一時停止、E は書き出し、R は録画。', reducedMotion: '動きを減らす', language: '言語', close: '閉じる', selected: '選択信号', diameter: '直径', velocity: '相対速度', missDistance: '最接近距離', hazardous: '潜在的危険', activeEvents: '活動中の地球イベント', solarEvents: '最近の太陽イベント', dataTimestamp: 'データ時刻', fallbackNotice: 'ライブデータを利用できません。明示された決定論的デモ信号を使用しています。', liveNotice: 'NASA 公式データに接続済み。', privacy: '分析なし、アカウントなし。キーは NASA 以外へ送信されません。', credits: '独立した教育プロジェクトで、NASA 公式製品ではありません。', capabilityWarning: 'この端末では安全にエンコードできません。低い解像度を選択してください。', recorderFallback: 'MP4 非対応のため WebM を使用します。', copied: 'リンクをコピーしました',
};

const ar: Dictionary = {
  missionControl: 'مركز التحكم بالمهمة', appSubtitle: 'مرصد حاسوبي مباشر', dataStreams: 'تدفقات بيانات', live: 'مباشر', cache: 'مخزّن', demo: 'تجريبي', loading: 'جارٍ التقاط الإشارة', unavailable: 'غير متاح', modes: 'أوضاع المرصد', orbit: 'مدار عميق', orbitDesc: 'عوالم بتتبع الأشعة وسياق APOD وتنقل حر.', earth: 'الأرض الحية', earthDesc: 'مشاهد EPIC الكاملة وأحداث EONET النشطة.', neo: 'مراقبة الأجسام القريبة', neoDesc: 'تمثيل الاقترابات كسرب مداري تقوده البيانات.', helio: 'فيزياء الشمس', helioDesc: 'تحويل التوهجات الشمسية وCME إلى ضوء وصوت.', archive: 'أرشيف ناسا', archiveDesc: 'ابحث في سجل ناسا للصور والفيديو والصوت.', quality: 'جودة الصورة', auto: 'تلقائي', low: 'منخفضة', balanced: 'متوازنة', high: 'عالية', ultra: 'فائقة', orbitMode: 'وضع المدار', speed: 'السرعة', tilt: 'الميل', sound: 'تحويل البيانات إلى صوت', record: 'تسجيل', stop: 'إيقاف', export: 'تصدير', exportStudio: 'استوديو التصدير', format: 'الصيغة', resolution: 'الدقة', viewport: 'العرض الحالي', fourK: '4K UHD', eightK: '8K UHD', download: 'تصيير وتنزيل', exporting: 'جارٍ التصيير بالدقة الأصلية…', recording: 'جارٍ تسجيل لوحة المرصد', apiKey: 'مفتاح NASA API', apiKeyHint: 'اختياري. DEMO_KEY محدود بشدة، والمفتاح الشخصي يبقى في جلسة المتصفح فقط.', apply: 'تطبيق', refreshData: 'تحديث البيانات المباشرة', telemetry: 'القياس عن بعد', apiHealth: 'حالة API ومصدرها', sourcePolicy: 'سياسة المصدر', openDocs: 'الوثائق الرسمية', archived: 'مؤرشف', referenceOnly: 'للمرجع فقط', browserReady: 'جاهز للمتصفح', search: 'بحث', searchPlaceholder: 'القمر، ويب، ثقب أسود، أرتميس…', noResults: 'لا توجد نتائج بعد.', about: 'حول هذه المهمة', aboutText: 'يحوّل OPUS 5 بيانات ناسا الموثقة إلى أداة قابلة للاستكشاف. المرئيات محسوبة وحالة المصدر ظاهرة دائماً.', help: 'التحكم', helpText: 'اسحب أو استخدم الأسهم للنظر، والعجلة أو القرص للتكبير. O للمدار، والمسافة للإيقاف، وE للتصدير، وR للتسجيل.', reducedMotion: 'تقليل الحركة', language: 'اللغة', close: 'إغلاق', selected: 'الإشارة المختارة', diameter: 'القطر', velocity: 'السرعة النسبية', missDistance: 'مسافة المرور', hazardous: 'خطر محتمل', activeEvents: 'أحداث الأرض النشطة', solarEvents: 'أحداث شمسية حديثة', dataTimestamp: 'وقت البيانات', fallbackNotice: 'البيانات المباشرة غير متاحة. يستخدم المصيّر إشارة تجريبية حتمية ومعلّمة بوضوح.', liveNotice: 'متصل ببيانات ناسا الرسمية.', privacy: 'لا تحليلات ولا حساب. لا تُرسل المفاتيح إلا إلى ناسا.', credits: 'مشروع تعليمي مستقل، وليس منتجاً رسمياً لناسا.', capabilityWarning: 'لا يستطيع هذا الجهاز ترميز الإطار بأمان. اختر دقة أقل.', recorderFallback: 'MP4 غير متاح؛ سيُستخدم WebM.', copied: 'تم نسخ الرابط',
};

export const translations: Record<Language, Dictionary> = {
  en,
  'pt-BR': ptBR,
  es,
  'zh-CN': zhCN,
  ko,
  fr,
  ja,
  de,
  ar,
};

let currentLanguage: Language = 'en';

export function detectLanguage(): Language {
  const saved = storageGet('local', 'opus5-language');
  if (saved && saved in translations) return saved as Language;
  const language = typeof navigator !== 'undefined' ? navigator.language : 'en';
  if (language.toLowerCase().startsWith('pt')) return 'pt-BR';
  if (language.toLowerCase().startsWith('zh')) return 'zh-CN';
  const short = language.split('-')[0] as Language;
  return short in translations ? short : 'en';
}

export function setLanguage(language: Language): void {
  currentLanguage = language;
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  storageSet('local', 'opus5-language', language);
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function t(key: TranslationKey): string {
  return translations[currentLanguage][key] || en[key];
}
