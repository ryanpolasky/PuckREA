import ctypes, os, struct, sys, time
from PIL import Image

APP_ID = 2994020
PUB_ID = 3826743382
MARKETING = 'C:/Projects/PuckREA/marketing'
STAGE = os.path.join(MARKETING, '_gallery')
SHOTS = ['shot_1_bowl', 'shot_2_center_ice', 'shot_3_upper_deck', 'shot_4_endzone']

os.makedirs(STAGE, exist_ok=True)
uploads = []
for name in SHOTS:
    out = os.path.join(STAGE, name + '.jpg')
    Image.open(os.path.join(MARKETING, name + '.png')).convert('RGB').resize((1600, 900), Image.LANCZOS).save(out, quality=84, optimize=True)
    uploads.append(out)
gif_out = os.path.join(STAGE, 'showcase_workshop.gif')
with Image.open(os.path.join(MARKETING, 'showcase_hd.gif')) as hd:
    frames = []
    for i in range(0, hd.n_frames, 4):
        hd.seek(i)
        frames.append(hd.convert('RGB').resize((384, 216), Image.LANCZOS))
frames[0].save(gif_out, save_all=True, append_images=frames[1:], duration=400, loop=0, optimize=True, colors=48)
uploads.append(gif_out)
for u in uploads:
    print(f'{os.path.basename(u)}: {os.path.getsize(u) // 1024} KB')

os.chdir('F:/SteamLibrary/steamapps/common/Puck')
dll = ctypes.CDLL('F:/SteamLibrary/steamapps/common/Puck/Puck_Data/Plugins/x86_64/steam_api64.dll')
err = ctypes.create_string_buffer(1024)
if dll.SteamAPI_InitFlat(err) != 0:
    sys.exit(f'SteamAPI_InitFlat failed: {err.value}')

for fn in ('SteamAPI_SteamUGC_v021', 'SteamAPI_SteamUtils_v010', 'SteamAPI_SteamRemoteStorage_v016'):
    getattr(dll, fn).restype = ctypes.c_void_p
ugc = dll.SteamAPI_SteamUGC_v021()
utils = dll.SteamAPI_SteamUtils_v010()
rs = dll.SteamAPI_SteamRemoteStorage_v016()


def bind(name, args, res):
    f = getattr(dll, name)
    f.argtypes = args
    f.restype = res
    return f


V, U64, U32, B, S = ctypes.c_void_p, ctypes.c_uint64, ctypes.c_uint32, ctypes.c_bool, ctypes.c_char_p
is_done = bind('SteamAPI_ISteamUtils_IsAPICallCompleted', [V, U64, ctypes.POINTER(B)], B)
get_res = bind('SteamAPI_ISteamUtils_GetAPICallResult', [V, U64, V, ctypes.c_int, ctypes.c_int, ctypes.POINTER(B)], B)
gfc = bind('SteamAPI_ISteamRemoteStorage_GetFileCount', [V], ctypes.c_int)
gfns = bind('SteamAPI_ISteamRemoteStorage_GetFileNameAndSize', [V, ctypes.c_int, ctypes.POINTER(ctypes.c_int)], S)
fdel = bind('SteamAPI_ISteamRemoteStorage_FileDelete', [V, S], B)
create_q = bind('SteamAPI_ISteamUGC_CreateQueryUGCDetailsRequest', [V, ctypes.POINTER(U64), U32], U64)
set_prev = bind('SteamAPI_ISteamUGC_SetReturnAdditionalPreviews', [V, U64, B], B)
send_q = bind('SteamAPI_ISteamUGC_SendQueryUGCRequest', [V, U64], U64)
num_prev = bind('SteamAPI_ISteamUGC_GetQueryUGCNumAdditionalPreviews', [V, U64, U32], U32)
release_q = bind('SteamAPI_ISteamUGC_ReleaseQueryUGCRequest', [V, U64], B)
start_upd = bind('SteamAPI_ISteamUGC_StartItemUpdate', [V, U32, U64], U64)
remove_prev = bind('SteamAPI_ISteamUGC_RemoveItemPreview', [V, U64, U32], B)
add_prev = bind('SteamAPI_ISteamUGC_AddItemPreviewFile', [V, U64, S, ctypes.c_int], B)
submit = bind('SteamAPI_ISteamUGC_SubmitItemUpdate', [V, U64, S], U64)


def wait(call, callback_id, size, timeout=300):
    failed = B(False)
    t0 = time.time()
    while time.time() - t0 < timeout:
        dll.SteamAPI_RunCallbacks()
        if is_done(utils, call, ctypes.byref(failed)):
            buf = ctypes.create_string_buffer(size)
            ok = get_res(utils, call, buf, size, callback_id, ctypes.byref(failed))
            return buf.raw if ok else None
        time.sleep(0.25)
    return None


def clear_cloud_previews():
    for i in range(gfc(rs) - 1, -1, -1):
        sz = ctypes.c_int()
        nm = gfns(rs, i, ctypes.byref(sz))
        if nm and b'preview' in nm:
            fdel(rs, nm)


def commit(upd, note):
    raw = wait(submit(ugc, upd, note.encode()), 3404, 24)
    if raw is None:
        return None
    return struct.unpack('<i', raw[:4])[0]


ids = (U64 * 1)(PUB_ID)
q = create_q(ugc, ids, 1)
set_prev(ugc, q, True)
raw = wait(send_q(ugc, q), 3401, 280)
existing = num_prev(ugc, q, 0) if raw and struct.unpack('<i', raw[8:12])[0] == 1 else 0
release_q(ugc, q)
print(f'Existing additional previews: {existing}')

if existing:
    upd = start_upd(ugc, APP_ID, PUB_ID)
    for i in range(existing - 1, -1, -1):
        remove_prev(ugc, upd, i)
    print('Remove old previews: eResult =', commit(upd, 'Refresh gallery'))

results = {}
for path in uploads:
    clear_cloud_previews()
    upd = start_upd(ugc, APP_ID, PUB_ID)
    add_prev(ugc, upd, os.path.abspath(path).encode(), 0)
    results[os.path.basename(path)] = commit(upd, 'Refresh gallery')
    print(f'Add {os.path.basename(path)}: eResult = {results[os.path.basename(path)]}')
clear_cloud_previews()

dll.SteamAPI_Shutdown()
