import wave, array, os, math

IN_DIR = 'C:/Users/ryanp/Downloads'
OUT_DIR = 'C:/Projects/PuckREA/dist/Ralph Engelstad Arena/audio'
os.makedirs(OUT_DIR, exist_ok=True)

SPECS = [
    (
        'goal_horn.wav',
        'North Dakota Fighting Sioux goal horn (OFFICIAL) - Brandon Test (128k).wav',
        0.35,   # trim leading silence so horn hits immediately on goal
        48.5,
        3200,   # balanced target RMS (-11 dB lower than before)
    ),
    (
        'stand_up_and_cheer.wav',
        'North Dakota University Fight Song- Stand Up and Cheer - Hydra (128k).wav',
        2.92,   # trim 2.92s of dead air at start
        57.5,
        2500,   # balanced PA background level
    ),
    (
        'fight_on_sioux.wav',
        'University of North Dakota Fight Song- Fight on Sioux (U.N.D.) - Michael Owens (128k).wav',
        0.18,
        69.0,
        2500,   # balanced PA background level
    ),
]

# Multi-tap stereo acoustic arena early reflections + diffuse rafters tail (delay_sec, gain_L, gain_R)
TAPS = [
    (0.034, 0.22, 0.16),  # ice sheet bounce
    (0.068, 0.15, 0.21),  # dasher glass slapback
    (0.112, 0.18, 0.14),  # lower bowl seating tiers
    (0.164, 0.12, 0.16),  # suite fascia & upper brick wall
    (0.228, 0.11, 0.09),  # opposite end-zone rafters echo
    (0.310, 0.08, 0.10),  # long diagonal arena decay 1
    (0.415, 0.06, 0.05),  # long diagonal arena decay 2
    (0.540, 0.04, 0.045), # late rafters tail
    (0.690, 0.025, 0.025),
]

for out_name, in_name, t_start, t_end, target_rms in SPECS:
    in_path = os.path.join(IN_DIR, in_name)
    with wave.open(in_path, 'rb') as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        n = w.getnframes()
        raw = array.array('h', w.readframes(n))

    i0 = max(0, min(n, int(t_start * sr))) * ch
    i1 = max(i0, min(n, int(t_end * sr))) * ch
    trimmed = raw[i0:i1]
    n_frames = len(trimmed) // ch

    # Compute current RMS
    sub = trimmed[::ch * 16]
    cur_rms = math.sqrt(sum(float(x) * float(x) for x in sub) / max(1, len(sub)))
    gain = (target_rms / max(100.0, cur_rms)) * 0.72  # headroom for wet reflections

    # Output stereo with 0.8s tail for arena reverb decay
    tail_frames = int(0.8 * sr)
    out_frames = n_frames + tail_frames
    outL = [0.0] * out_frames
    outR = [0.0] * out_frames

    # Dry + 1-pole low-pass on wet reflections so echoes sound like warm distant concrete/rafters
    lpL = [0.0] * n_frames
    lpR = [0.0] * n_frames
    prevL = 0.0
    prevR = 0.0
    alpha = 0.32  # warm ~3.2kHz rolloff on arena reflections
    for f in range(n_frames):
        sL = trimmed[f * ch] * gain
        sR = trimmed[f * ch + (1 if ch > 1 else 0)] * gain
        outL[f] = sL
        outR[f] = sR
        prevL += alpha * (sL - prevL)
        prevR += alpha * (sR - prevR)
        lpL[f] = prevL
        lpR[f] = prevR

    # Add cross-coupled stereo arena reflections
    for delay_s, gL, gR in TAPS:
        d = int(delay_s * sr)
        for f in range(n_frames):
            outL[f + d] += lpL[f] * gL + lpR[f] * (gR * 0.45)
            outR[f + d] += lpR[f] * gR + lpL[f] * (gL * 0.45)

    # Soft-clip / limiter to int16 and apply 0.5s fade-out at end
    out_pcm = array.array('h', [0] * (out_frames * 2))
    fade_len = int(0.5 * sr)
    for f in range(out_frames):
        vL = outL[f]
        vR = outR[f]
        if f > out_frames - fade_len:
            fade = (out_frames - f) / fade_len
            vL *= fade
            vR *= fade
        # Soft saturation above 26000
        for idx, v in enumerate((vL, vR)):
            if v > 26000.0:
                v = 26000.0 + 6700.0 * math.tanh((v - 26000.0) / 6700.0)
            elif v < -26000.0:
                v = -26000.0 + 6700.0 * math.tanh((v + 26000.0) / 6700.0)
            out_pcm[f * 2 + idx] = max(-32767, min(32767, int(v)))

    out_path = os.path.join(OUT_DIR, out_name)
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(out_pcm.tobytes())
    print(f"Processed {out_name}: {out_frames/sr:.1f}s stereo {sr}Hz ({os.path.getsize(out_path)//1024} KB)")
