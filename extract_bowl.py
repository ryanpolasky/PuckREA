import UnityPy, struct, json, os

SRC = 'F:/SteamLibrary/steamapps/workshop/content/2994020/3818618849/DomSportova/AssetBundles/domsportova'
OUT_DIR = 'C:/Projects/PuckREA/assets'
os.makedirs(OUT_DIR, exist_ok=True)

env = UnityPy.load(SRC)
by_id = {o.path_id: o for o in env.objects}
gos = {}; trs = {}; go_tr = {}; mfs = {}; mrs = {}
for o in env.objects:
    if o.type.name == 'GameObject': d = o.read(); gos[o.path_id] = d
    elif o.type.name == 'Transform': d = o.read(); trs[o.path_id] = d; go_tr[d.m_GameObject.path_id] = d
    elif o.type.name == 'MeshFilter': d = o.read(); mfs[d.m_GameObject.path_id] = d
    elif o.type.name == 'MeshRenderer': d = o.read(); mrs[d.m_GameObject.path_id] = d

WANT_MESHES = {
    'Bowl', 'Stairs', 'Railings', 'Seats_100_A', 'Seats_100_B',
    'Benches_PenaltyBoxes', 'Bench_Glass', 'Goal_Nets', 'Section_Signs',
    'Fascia_Ribbon'
}

mat_prims = {}

for gid, mf in mfs.items():
    gname = gos[gid].m_Name
    if gname not in WANT_MESHES:
        continue
    md = by_id[mf.m_Mesh.path_id].read()
    mr = mrs[gid]
    mats = [by_id[m.path_id].read().m_Name for m in mr.m_Materials]
    obj = md.export()

    vs = []
    vns = []
    vts = []
    groups = []
    cur_faces = []
    for line in obj.splitlines():
        if line.startswith('v '):
            _, ox, oy, oz = line.split()
            ox, oy, oz = float(ox), float(oy), float(oz)
            vs.append((oz, oy, -ox))
        elif line.startswith('vn '):
            _, nx, ny, nz = line.split()
            nx, ny, nz = float(nx), float(ny), float(nz)
            vns.append((nz, ny, -nx))
        elif line.startswith('vt '):
            parts = line.split()
            u, v = float(parts[1]), float(parts[2])
            if gname == 'Fascia_Ribbon':
                u += 8.0
            vts.append((u, 1.0 - v))
        elif line.startswith('g '):
            if cur_faces:
                groups.append(cur_faces)
                cur_faces = []
        elif line.startswith('f '):
            parts = line.split()[1:]
            idxs = [int(p.split('/')[0]) - 1 for p in parts]
            cur_faces.append((idxs[0], idxs[2], idxs[1]))
    if cur_faces:
        groups.append(cur_faces)

    assert len(groups) == len(mats), f"{gname}: groups={len(groups)} vs mats={len(mats)}"
    for mname, faces in zip(mats, groups):
        if mname not in mat_prims:
            mat_prims[mname] = {'pos': [], 'norm': [], 'uv': [], 'idx': [], 'vcount': 0}
        mp = mat_prims[mname]
        remap = {}
        for i0, i1, i2 in faces:
            for vi in (i0, i1, i2):
                nv = remap.get(vi)
                if nv is None:
                    nv = mp['vcount']
                    remap[vi] = nv
                    mp['vcount'] += 1
                    mp['pos'].extend(vs[vi])
                    mp['norm'].extend(vns[vi] if vi < len(vns) else (0.0, 1.0, 0.0))
                    mp['uv'].extend(vts[vi] if vi < len(vts) else (0.0, 0.0))
                mp['idx'].append(nv)
    print(f"Extracted {gname}: {len(vs)} verts, {len(groups)} submeshes")

spectators = []
for pid, tr in trs.items():
    g = gos.get(tr.m_GameObject.path_id)
    if g and g.m_Name.startswith('Spectator_'):
        p = tr.m_LocalPosition
        spectators.append({'x': round(-float(p.x), 3), 'y': round(float(p.y), 3), 'z': round(float(p.z), 3)})

spectators_thinned = spectators[::2]
print(f"Extracted {len(spectators)} spectators -> thinned to {len(spectators_thinned)}")

bin_parts = []
meta_prims = []
offset = 0
for mname, mp in mat_prims.items():
    pos_b = struct.pack(f'<{len(mp["pos"])}f', *mp['pos'])
    norm_b = struct.pack(f'<{len(mp["norm"])}f', *mp['norm'])
    uv_b = struct.pack(f'<{len(mp["uv"])}f', *mp['uv'])
    idx_b = struct.pack(f'<{len(mp["idx"])}I', *mp['idx'])
    blob = pos_b + norm_b + uv_b + idx_b
    meta_prims.append({
        'mat': mname,
        'vcount': mp['vcount'],
        'icount': len(mp['idx']),
        'offset': offset,
        'posLen': len(pos_b),
        'normLen': len(norm_b),
        'uvLen': len(uv_b),
        'idxLen': len(idx_b),
    })
    bin_parts.append(blob)
    offset += len(blob)

open(f'{OUT_DIR}/bowl.bin', 'wb').write(b''.join(bin_parts))
open(f'{OUT_DIR}/bowl.json', 'w').write(json.dumps({'prims': meta_prims, 'spectators': spectators_thinned}, indent=2))
print(f"Wrote {OUT_DIR}/bowl.bin ({offset / 1024:.0f} KB) and bowl.json ({len(meta_prims)} material groups)")
