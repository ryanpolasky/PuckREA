using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;

namespace RalphEngelstadAudio
{
    public class Plugin : IPuckPlugin
    {
        private static GameObject _host;

        public bool OnEnable()
        {
            try
            {
                if (_host != null) return true;
                _host = new GameObject("RalphEngelstadAudioHost");
                UnityEngine.Object.DontDestroyOnLoad(_host);
                _host.AddComponent<ArenaAudioController>();
                Debug.Log("[RalphEngelstadAudio] Enabled 3D Positional PA & Goal Horn system");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError("[RalphEngelstadAudio] OnEnable failed: " + ex);
                return false;
            }
        }

        public bool OnDisable()
        {
            try
            {
                if (_host != null)
                {
                    UnityEngine.Object.Destroy(_host);
                    _host = null;
                }
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError("[RalphEngelstadAudio] OnDisable failed: " + ex);
                return false;
            }
        }
    }

    public class ArenaAudioController : MonoBehaviour
    {
        private const string BoardCylinderPreference = "REA_BoardCylinder";
        private static bool _useCylinder;

        private sealed class LiveScoreTextSet
        {
            public TMP_Text Blue;
            public TMP_Text Clock;
            public TMP_Text Red;
            public TMP_Text Period;
        }

        private AudioClip _goalHorn;
        private AudioClip _standUp;
        private AudioClip _fightOn;

        private GameObject _arenaRoot;
        private GameObject _paRoot;
        private MeshFilter _barrierGlassMf;
        private Mesh _originalBarrierGlassMesh;
        private Mesh _cutBarrierGlassMesh;
        private MeshRenderer _barrierPillarsRenderer;
        private bool _boardNodesWarningLogged;
        private bool _arenaBound;
        private readonly List<AudioSource> _centerSpeakers = new List<AudioSource>();
        private readonly List<AudioSource> _endSpeakers = new List<AudioSource>();
        private readonly List<AudioSource> _hornSpeakers = new List<AudioSource>();
        private readonly List<AudioSource> _mutedVanillaHorns = new List<AudioSource>();
        private readonly List<Scoreboard> _hiddenVanillaScoreboards = new List<Scoreboard>();
        private readonly List<GameObject> _liveScoreRoots = new List<GameObject>();
        private readonly List<LiveScoreTextSet> _liveScoreTexts = new List<LiveScoreTextSet>();

        private float _targetVolume = 0f;
        private float _currentVolume = 0f;
        private float _fadeSpeed = 0.8f;
        private int _goalCounter = 0;
        private float _followUpTimer = -1f;
        private GamePhase _lastPhase = GamePhase.None;

        private void Awake()
        {
            _useCylinder = PlayerPrefs.GetInt(BoardCylinderPreference, 0) != 0;
            string dir = FindAudioDirectory();
            if (dir != null)
            {
                _goalHorn = LoadWav(Path.Combine(dir, "goal_horn.wav"), "REA_GoalHorn");
                _standUp = LoadWav(Path.Combine(dir, "stand_up_and_cheer.wav"), "REA_StandUpAndCheer");
                _fightOn = LoadWav(Path.Combine(dir, "fight_on_sioux.wav"), "REA_FightOnSioux");
                Debug.Log("[RalphEngelstadAudio] Loaded WAV clips from " + dir);
            }
            else
            {
                Debug.LogWarning("[RalphEngelstadAudio] Could not find audio directory");
            }

            EventManager.AddEventListener("Event_Everyone_OnGoalScored", OnGoalScored);
            EventManager.AddEventListener("Event_Everyone_OnGameStateChanged", OnGameStateChanged);
        }

        private void OnDestroy()
        {
            EventManager.RemoveEventListener("Event_Everyone_OnGoalScored", OnGoalScored);
            EventManager.RemoveEventListener("Event_Everyone_OnGameStateChanged", OnGameStateChanged);
            RestoreVanillaHorns();
            RestoreBarrierGlass();
            RestoreVanillaScoreboards();
            DestroyLiveScoreboards();
        }

        private static string FindAudioDirectory()
        {
            string asmDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string[] candidates = new string[]
            {
                Path.Combine(asmDir, "audio"),
                Path.Combine(asmDir, "Ralph Engelstad Arena", "audio"),
                @"F:\SteamLibrary\steamapps\workshop\content\2994020\3802863574\Ralph Engelstad Arena\audio",
                @"F:\SteamLibrary\steamapps\workshop\content\2994020\3802863574\Ralph Engelstad Arena BETA\audio",
                @"C:\Projects\PuckREA\dist\Ralph Engelstad Arena\audio"
            };
            foreach (string c in candidates)
            {
                if (Directory.Exists(c) && File.Exists(Path.Combine(c, "goal_horn.wav")))
                    return c;
            }
            return null;
        }

        private static AudioClip LoadWav(string path, string clipName)
        {
            if (!File.Exists(path)) return null;
            byte[] bytes = File.ReadAllBytes(path);
            int channels = BitConverter.ToInt16(bytes, 22);
            int sampleRate = BitConverter.ToInt32(bytes, 24);
            int pos = 12;
            while (pos + 8 < bytes.Length)
            {
                string chunkId = System.Text.Encoding.ASCII.GetString(bytes, pos, 4);
                int chunkSize = BitConverter.ToInt32(bytes, pos + 4);
                if (chunkId == "data")
                {
                    int dataStart = pos + 8;
                    int sampleCount = chunkSize / 2;
                    int frameCount = sampleCount / channels;
                    float[] samples = new float[sampleCount];
                    for (int i = 0; i < sampleCount && (dataStart + i * 2 + 1) < bytes.Length; i++)
                    {
                        short s = BitConverter.ToInt16(bytes, dataStart + i * 2);
                        samples[i] = s / 32768f;
                    }
                    AudioClip clip = AudioClip.Create(clipName, frameCount, channels, sampleRate, false);
                    clip.SetData(samples, 0);
                    return clip;
                }
                pos += 8 + chunkSize;
            }
            return null;
        }

        private GameObject _pendingRoot;
        private float _pendingReadyAt = -1f;
        private float _nextReadyCheck;

        private bool IsArenaInstantiated(GameObject root)
        {
            if (root != _pendingRoot)
            {
                _pendingRoot = root;
                _pendingReadyAt = -1f;
            }
            if (_pendingReadyAt < 0f)
            {
                if (Time.unscaledTime < _nextReadyCheck) return false;
                _nextReadyCheck = Time.unscaledTime + 0.25f;
                bool hasBoard = false;
                foreach (Transform node in root.GetComponentsInChildren<Transform>(true))
                {
                    if (node.name == "REA_Board_Box") { hasBoard = true; break; }
                }
                if (!hasBoard || root.GetComponentInChildren<Renderer>(true) == null) return false;
                _pendingReadyAt = Time.unscaledTime + 0.75f;
            }
            return Time.unscaledTime >= _pendingReadyAt;
        }

        private void EnsureSpeakerRig()
        {
            if (_arenaRoot != null && _paRoot != null) return;
            GameObject found = GameObject.Find("Arena Ralph Engelstad Arena");
            if (found == null) found = GameObject.Find("Arena Ralph Engelstad Arena BETA");
            if (found == null)
            {
                if (_arenaBound)
                {
                    RestoreVanillaHorns();
                    RestoreBarrierGlass();
                    RestoreVanillaScoreboards();
                    DestroyLiveScoreboards();
                    _arenaRoot = null;
                    _paRoot = null;
                    _arenaBound = false;
                }
                return;
            }

            if (_arenaBound && _arenaRoot != found)
            {
                RestoreVanillaHorns();
                RestoreBarrierGlass();
                RestoreVanillaScoreboards();
                DestroyLiveScoreboards();
                _paRoot = null;
                _arenaRoot = null;
                _arenaBound = false;
            }

            if (!IsArenaInstantiated(found)) return;

            // Reload WAVs on arena bind so hot-reloads in ARENA LOADER pick up updated audio immediately
            string dir = FindAudioDirectory();
            if (dir != null)
            {
                _goalHorn = LoadWav(Path.Combine(dir, "goal_horn.wav"), "REA_GoalHorn");
                _standUp = LoadWav(Path.Combine(dir, "stand_up_and_cheer.wav"), "REA_StandUpAndCheer");
                _fightOn = LoadWav(Path.Combine(dir, "fight_on_sioux.wav"), "REA_FightOnSioux");
            }

            _arenaRoot = found;
            _arenaBound = true;
            ApplyBoardState();
            CreateLiveScoreboards();
            HideVanillaScoreboards();
            UpdateLiveScoreFromManager();
            _paRoot = new GameObject("REA_PositionalPA_System");
            _paRoot.transform.SetParent(_arenaRoot.transform, false);

            CutBenchBarrierGlass();

            _centerSpeakers.Clear();
            _endSpeakers.Clear();
            _hornSpeakers.Clear();

            // 4 Overhead Line-Array Speaker Clusters matching our 3D speaker models around the Jumbotron & Rafters
            _centerSpeakers.Add(CreateSpeaker("PA_Jumbotron_East", new Vector3(9.0f, 18.8f, 0.0f), false));
            _centerSpeakers.Add(CreateSpeaker("PA_Jumbotron_West", new Vector3(-9.0f, 18.8f, 0.0f), false));
            _endSpeakers.Add(CreateSpeaker("PA_North_Rafters", new Vector3(0.0f, 18.8f, 34.0f), true));
            _endSpeakers.Add(CreateSpeaker("PA_South_Rafters", new Vector3(0.0f, 18.8f, -34.0f), true));

            // Dedicated Goal Horn clusters over the North & South goals + Jumbotron center
            _hornSpeakers.Add(CreateSpeaker("GoalHorn_Center", new Vector3(0.0f, 17.5f, 0.0f), false));
            _hornSpeakers.Add(CreateSpeaker("GoalHorn_North", new Vector3(0.0f, 15.5f, 38.0f), true));
            _hornSpeakers.Add(CreateSpeaker("GoalHorn_South", new Vector3(0.0f, 15.5f, -38.0f), true));

            // Expand the level's AudioReverbZone so the entire Ralph Engelstad bowl gets the 2.9s Arena reverb
            foreach (AudioReverbZone rz in UnityEngine.Object.FindObjectsOfType<AudioReverbZone>())
            {
                rz.reverbPreset = AudioReverbPreset.Arena;
                rz.minDistance = 65f;
                rz.maxDistance = 135f;
            }

            // Mute vanilla tiny goal buzzers while The Ralph is loaded so only the real Fighting Sioux Goal Horn blasts
            MuteVanillaHorns();
            _lastPhase = GamePhase.None;
            Debug.Log("[RalphEngelstadAudio] Built 7-cluster 3D Positional PA Speaker Rig inside The Ralph");
        }

        private void ApplyBoardState()
        {
            if (_arenaRoot == null) return;

            bool foundBox = false;
            bool foundCylinder = false;
            foreach (Transform node in _arenaRoot.GetComponentsInChildren<Transform>(true))
            {
                if (node == null) continue;
                if (node.name.StartsWith("REA_Board_Box", StringComparison.Ordinal))
                {
                    node.gameObject.SetActive(!_useCylinder);
                    foundBox = true;
                }
                else if (node.name.StartsWith("REA_Board_Cylinder", StringComparison.Ordinal))
                {
                    node.localScale = Vector3.one;
                    node.gameObject.SetActive(_useCylinder);
                    foundCylinder = true;
                }
            }

            if ((!foundBox || !foundCylinder) && !_boardNodesWarningLogged)
            {
                Debug.LogWarning("[RalphEngelstadAudio] Could not find both jumbotron board nodes");
                _boardNodesWarningLogged = true;
            }
        }

        private TMP_FontAsset FindScoreFont()
        {
            Scoreboard[] scoreboards = UnityEngine.Object.FindObjectsByType<Scoreboard>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            foreach (Scoreboard scoreboard in scoreboards)
            {
                if (scoreboard == null) continue;
                TMP_Text[] texts = scoreboard.GetComponentsInChildren<TMP_Text>(true);
                foreach (TMP_Text text in texts)
                {
                    if (text != null && text.font != null) return text.font;
                }
            }
            return TMP_Settings.defaultFontAsset;
        }

        private TMP_Text CreateScoreText(Transform parent, string name, float w, float h, float u, float v, float slotW, float slotH, Color color, TMP_FontAsset font)
        {
            GameObject go = new GameObject(name, typeof(TextMeshPro));
            go.transform.SetParent(parent, false);
            TextMeshPro text = go.GetComponent<TextMeshPro>();
            if (font != null) text.font = font;
            text.enableAutoSizing = true;
            text.fontSizeMin = 1f;
            text.fontSizeMax = 512f;
            text.alignment = TextAlignmentOptions.Center;
            text.textWrappingMode = TextWrappingModes.NoWrap;
            text.overflowMode = TextOverflowModes.Overflow;
            text.color = color;
            text.rectTransform.sizeDelta = new Vector2(w * slotW, h * slotH);
            text.rectTransform.localPosition = new Vector3((u - 0.5f) * w, (v - 0.5f) * h, 0f);
            return text;
        }

        private void CreateLiveScoreboards()
        {
            DestroyLiveScoreboards();
            if (_arenaRoot == null) return;
            TMP_FontAsset font = FindScoreFont();
            Transform[] nodes = _arenaRoot.GetComponentsInChildren<Transform>(true);
            foreach (Transform anchor in nodes)
            {
                if (anchor == null || !anchor.name.StartsWith("REA_ScoreAnchor_", StringComparison.Ordinal)) continue;
                Transform board = anchor.parent;
                if (board == null || !board.name.StartsWith("REA_Board_", StringComparison.Ordinal)) continue;
                float w = anchor.lossyScale.x;
                float h = anchor.lossyScale.y;
                if (w <= 0.01f || h <= 0.01f) continue;

                Vector3 outward = anchor.forward;
                Vector3 horizontalOut = new Vector3(outward.x, 0f, outward.z);
                Vector3 radial = anchor.position - board.position;
                radial.y = 0f;
                if (Vector3.Dot(horizontalOut, radial) < 0f) outward = -outward;

                GameObject root = new GameObject("REA_LiveScore_" + anchor.name);
                root.transform.SetParent(board, false);
                root.transform.position = anchor.position;
                root.transform.rotation = Quaternion.LookRotation(-outward, anchor.up);
                root.transform.localScale = Vector3.one;
                _liveScoreRoots.Add(root);
                _liveScoreTexts.Add(new LiveScoreTextSet
                {
                    Blue = CreateScoreText(root.transform, "BlueScore", w, h, 0.18f, 0.45f, 0.26f, 0.42f, Color.white, font),
                    Clock = CreateScoreText(root.transform, "Clock", w, h, 0.50f, 0.66f, 0.40f, 0.36f, new Color(1f, 0.78f, 0.25f), font),
                    Red = CreateScoreText(root.transform, "RedScore", w, h, 0.82f, 0.45f, 0.26f, 0.42f, Color.white, font),
                    Period = CreateScoreText(root.transform, "Period", w, h, 0.50f, 0.13f, 0.14f, 0.18f, new Color(0.55f, 1f, 0.6f), font),
                });
            }
        }

        private void DestroyLiveScoreboards()
        {
            foreach (GameObject root in _liveScoreRoots)
            {
                if (root != null) UnityEngine.Object.Destroy(root);
            }
            _liveScoreRoots.Clear();
            _liveScoreTexts.Clear();
        }

        private void HideVanillaScoreboards()
        {
            Scoreboard[] scoreboards = UnityEngine.Object.FindObjectsByType<Scoreboard>(FindObjectsInactive.Include, FindObjectsSortMode.None);
            foreach (Scoreboard scoreboard in scoreboards)
            {
                if (scoreboard == null || scoreboard.gameObject == null) continue;
                if (!scoreboard.gameObject.activeSelf) continue;
                if (!_hiddenVanillaScoreboards.Contains(scoreboard)) _hiddenVanillaScoreboards.Add(scoreboard);
                scoreboard.gameObject.SetActive(false);
            }
        }

        private void RestoreVanillaScoreboards()
        {
            foreach (Scoreboard scoreboard in _hiddenVanillaScoreboards)
            {
                if (scoreboard != null && scoreboard.gameObject != null) scoreboard.gameObject.SetActive(true);
            }
            _hiddenVanillaScoreboards.Clear();
        }

        private void UpdateLiveScore(GameState gs)
        {
            bool timed = (int)gs.Phase >= (int)GamePhase.PreGame && (int)gs.Phase <= (int)GamePhase.PostGame;
            int totalSeconds = Math.Max(0, (int)gs.Tick);
            string clock = timed ? string.Format("{0:00}:{1:00}", totalSeconds / 60, totalSeconds % 60) : "--:--";
            string period = timed ? (gs.IsOvertime ? "OT" : gs.Period.ToString()) : "-";
            foreach (LiveScoreTextSet text in _liveScoreTexts)
            {
                if (text.Blue != null) text.Blue.text = gs.BlueScore.ToString();
                if (text.Clock != null) text.Clock.text = clock;
                if (text.Red != null) text.Red.text = gs.RedScore.ToString();
                if (text.Period != null) text.Period.text = period;
            }
        }

        private void UpdateLiveScoreFromManager()
        {
            GameManager manager = NetworkBehaviourSingleton<GameManager>.Instance;
            if (manager != null) UpdateLiveScore(manager.GameState.Value);
        }

        private AudioSource CreateSpeaker(string name, Vector3 pos, bool isDistantEndSpeaker)
        {
            GameObject go = new GameObject(name);
            go.transform.SetParent(_paRoot.transform, false);
            go.transform.localPosition = pos;

            AudioSource src = go.AddComponent<AudioSource>();
            src.playOnAwake = false;
            src.loop = false;
            src.spatialBlend = 0.88f;
            src.rolloffMode = AudioRolloffMode.Logarithmic;
            src.minDistance = 10.0f;
            src.maxDistance = 120.0f;
            src.spread = 58.0f;
            src.dopplerLevel = 0.0f;
            src.reverbZoneMix = 0.72f;
            src.priority = 64;

            if (isDistantEndSpeaker)
            {
                AudioEchoFilter echo = go.AddComponent<AudioEchoFilter>();
                echo.delay = 88.0f;
                echo.decayRatio = 0.18f;
                echo.dryMix = 0.88f;
                echo.wetMix = 0.14f;
            }

            return src;
        }

        private void CutBenchBarrierGlass()
        {
            try
            {
                RestoreBarrierGlass();
                foreach (MeshFilter mf in UnityEngine.Object.FindObjectsOfType<MeshFilter>())
                {
                    if (mf != null && mf.gameObject != null && mf.gameObject.name == "Barrier Glass" && mf.sharedMesh != null && mf.sharedMesh.isReadable)
                    {
                        _barrierGlassMf = mf;
                        _originalBarrierGlassMesh = mf.sharedMesh;
                        Mesh src = _originalBarrierGlassMesh;
                        Vector3[] verts = src.vertices;
                        int[] tris = src.triangles;
                        List<int> kept = new List<int>(tris.Length);
                        Transform tr = mf.transform;
                        for (int i = 0; i < tris.Length; i += 3)
                        {
                            Vector3 w0 = tr.TransformPoint(verts[tris[i]]);
                            Vector3 w1 = tr.TransformPoint(verts[tris[i + 1]]);
                            Vector3 w2 = tr.TransformPoint(verts[tris[i + 2]]);
                            Vector3 c = (w0 + w1 + w2) / 3f;
                            // Player benches are on Unity -X (x < -21, |z| < 10.65); penalty boxes on Unity +X keep their front glass!
                            if (c.x < -21.0f && Mathf.Abs(c.z) < 10.65f)
                                continue;
                            kept.Add(tris[i]);
                            kept.Add(tris[i + 1]);
                            kept.Add(tris[i + 2]);
                        }
                        _cutBarrierGlassMesh = UnityEngine.Object.Instantiate(src);
                        _cutBarrierGlassMesh.name = "BarrierGlass_REA_NoBench";
                        _cutBarrierGlassMesh.triangles = kept.ToArray();
                        mf.sharedMesh = _cutBarrierGlassMesh;
                        break;
                    }
                }
                foreach (MeshRenderer mr in UnityEngine.Object.FindObjectsOfType<MeshRenderer>())
                {
                    if (mr != null && mr.gameObject != null && mr.gameObject.name == "Barrier Pillars" && mr.enabled)
                    {
                        _barrierPillarsRenderer = mr;
                        mr.enabled = false;
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning("[RalphEngelstadAudio] CutBenchBarrierGlass: " + ex.Message);
            }
        }

        private void RestoreBarrierGlass()
        {
            if (_barrierPillarsRenderer != null)
            {
                _barrierPillarsRenderer.enabled = true;
                _barrierPillarsRenderer = null;
            }
            if (_barrierGlassMf != null && _originalBarrierGlassMesh != null)
            {
                _barrierGlassMf.sharedMesh = _originalBarrierGlassMesh;
            }
            if (_cutBarrierGlassMesh != null)
            {
                UnityEngine.Object.Destroy(_cutBarrierGlassMesh);
                _cutBarrierGlassMesh = null;
            }
            _barrierGlassMf = null;
            _originalBarrierGlassMesh = null;
        }

        private void MuteVanillaHorns()
        {
            _mutedVanillaHorns.Clear();
            foreach (AudioSource src in UnityEngine.Object.FindObjectsOfType<AudioSource>())
            {
                if (src == null || src.gameObject == null) continue;
                string n = src.gameObject.name;
                if (n == "Blue Goal" || n == "Red Goal")
                {
                    if (!src.mute)
                    {
                        src.mute = true;
                        _mutedVanillaHorns.Add(src);
                    }
                }
            }
        }

        private void RestoreVanillaHorns()
        {
            foreach (AudioSource src in _mutedVanillaHorns)
            {
                if (src != null) src.mute = false;
            }
            _mutedVanillaHorns.Clear();
        }

        private void PlayPA(AudioClip clip, float volume, bool useHornCluster, bool loop = false)
        {
            EnsureSpeakerRig();
            if (_paRoot == null || clip == null) return;

            StopAllSpeakers();
            _currentVolume = volume;
            _targetVolume = volume;
            _fadeSpeed = 0.8f;

            double now = AudioSettings.dspTime + 0.02;
            float centerGain = useHornCluster ? 0.20f : 0.30f;
            float endGain = useHornCluster ? 0.15f : 0.24f;
            foreach (AudioSource s in _centerSpeakers)
            {
                s.clip = clip;
                s.loop = loop;
                s.volume = volume * centerGain;
                s.PlayScheduled(now);
            }
            foreach (AudioSource s in _endSpeakers)
            {
                s.clip = clip;
                s.loop = loop;
                s.volume = volume * endGain;
                s.PlayScheduled(now + 0.075);
            }
            if (useHornCluster)
            {
                foreach (AudioSource s in _hornSpeakers)
                {
                    s.clip = clip;
                    s.loop = false;
                    s.volume = volume * 0.22f;
                    s.PlayScheduled(now);
                }
            }
        }

        private void StopAllSpeakers()
        {
            foreach (AudioSource s in _centerSpeakers) if (s != null) s.Stop();
            foreach (AudioSource s in _endSpeakers) if (s != null) s.Stop();
            foreach (AudioSource s in _hornSpeakers) if (s != null) s.Stop();
        }

        private void ApplyVolume(float v)
        {
            foreach (AudioSource s in _centerSpeakers) if (s != null) s.volume = v * 0.26f;
            foreach (AudioSource s in _endSpeakers) if (s != null) s.volume = v * 0.20f;
            foreach (AudioSource s in _hornSpeakers) if (s != null) s.volume = v * 0.22f;
        }

        private void OnGoalScored(Dictionary<string, object> msg)
        {
            EnsureSpeakerRig();
            if (_paRoot == null) return;

            _goalCounter++;
            _followUpTimer = -1f;
            _lastPhase = GamePhase.BlueScore;
            PlayPA(_goalHorn, 0.72f, true, false);
        }

        private void ApplyPhaseAudio(GamePhase phase)
        {
            if (phase == _lastPhase || phase == GamePhase.None) return;
            _lastPhase = phase;

            if (phase == GamePhase.BlueScore || phase == GamePhase.RedScore)
            {
                _followUpTimer = -1f;
                PlayPA(_goalHorn, 0.72f, true, false);
            }
            else if (phase == GamePhase.Warmup || phase == GamePhase.PreGame)
            {
                _followUpTimer = -1f;
                PlayPA(_fightOn, 0.86f, false, true);
            }
            else if (phase == GamePhase.Intermission || phase == GamePhase.GameOver || phase == GamePhase.PostGame)
            {
                _followUpTimer = -1f;
                PlayPA(_standUp, 0.88f, false, false);
            }
            else if (phase == GamePhase.FaceOff || phase == GamePhase.Play)
            {
                _followUpTimer = -1f;
                _targetVolume = 0f;
                _fadeSpeed = 0.7f;
            }
        }

        private void OnGameStateChanged(Dictionary<string, object> msg)
        {
            EnsureSpeakerRig();
            if (_arenaRoot != null) HideVanillaScoreboards();
            if (msg != null && msg.ContainsKey("newGameState"))
            {
                GameState gs = (GameState)msg["newGameState"];
                UpdateLiveScore(gs);
                if (_paRoot != null) ApplyPhaseAudio(gs.Phase);
            }
            else
            {
                UpdateLiveScoreFromManager();
            }
        }

        private void Update()
        {
            EnsureSpeakerRig();
            if (_paRoot != null)
            {
                if (NetworkBehaviourSingleton<GameManager>.Instance != null)
                {
                    ApplyPhaseAudio(NetworkBehaviourSingleton<GameManager>.Instance.Phase);
                }

                if (_followUpTimer > 0f)
                {
                    _followUpTimer -= Time.deltaTime;
                    if (_followUpTimer <= 0f && _standUp != null)
                    {
                        PlayPA(_standUp, 0.80f, false, false);
                    }
                }

                if (Mathf.Abs(_currentVolume - _targetVolume) > 0.005f)
                {
                    _currentVolume = Mathf.MoveTowards(_currentVolume, _targetVolume, _fadeSpeed * Time.deltaTime);
                    ApplyVolume(_currentVolume);
                    if (_currentVolume <= 0.01f && _targetVolume <= 0.01f)
                    {
                        StopAllSpeakers();
                    }
                }
            }

            // F6 horn, F7 cheer, F8 Sioux, F9 stop PA, F10 board toggle
            Keyboard kb = Keyboard.current;
            if (kb != null)
            {
                if (kb.f10Key.wasPressedThisFrame)
                {
                    _useCylinder = !_useCylinder;
                    PlayerPrefs.SetInt(BoardCylinderPreference, _useCylinder ? 1 : 0);
                    PlayerPrefs.Save();
                    ApplyBoardState();
                }

                if (_paRoot != null && kb.f6Key.wasPressedThisFrame)
                {
                    _followUpTimer = -1f;
                    PlayPA(_goalHorn, 0.72f, true, false);
                }
                else if (_paRoot != null && kb.f7Key.wasPressedThisFrame)
                {
                    _followUpTimer = -1f;
                    PlayPA(_standUp, 0.88f, false, false);
                }
                else if (_paRoot != null && kb.f8Key.wasPressedThisFrame)
                {
                    _followUpTimer = -1f;
                    PlayPA(_fightOn, 0.88f, false, false);
                }
                else if (_paRoot != null && kb.f9Key.wasPressedThisFrame)
                {
                    _followUpTimer = -1f;
                    _targetVolume = 0f;
                    _fadeSpeed = 1.2f;
                }
            }
        }
    }
}
