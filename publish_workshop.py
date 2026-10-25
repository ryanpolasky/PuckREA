import ctypes, os, time, struct

APP_ID = 2994020
ID_FILE = 'C:/Projects/PuckREA/workshop_item_id.txt'
CONTENT_DIR = 'C:/Projects/PuckREA/dist/Ralph Engelstad Arena'
PREVIEW_IMG = 'C:/Projects/PuckREA/marketing/hero_thumbnail_small.jpg'
EXTRA_SHOTS = [
    'C:/Projects/PuckREA/marketing/shot_1_bowl.jpg',
    'C:/Projects/PuckREA/marketing/shot_2_center_ice.jpg',
    'C:/Projects/PuckREA/marketing/shot_3_upper_deck.jpg',
    'C:/Projects/PuckREA/marketing/shot_4_endzone.jpg',
]
TITLE = 'Ralph Engelstad Arena (Fighting Sioux)'
DESC = """Fighting Sioux-era Ralph Engelstad Arena ("The Ralph") in Grand Forks, ND.

Requires [url=https://steamcommunity.com/sharedfiles/filedetails/?id=3802863574]Arena Loader[/url].
[i]Note: Enable this item in the MODS menu too for the custom 3D goal horn & fight songs.[/i]

[b]Includes[/b]
[list]
[*] Full lower bowl, luxury suites, brick medallion upper wall, championship banners, and center jumbotron
[*] Center-ice Fighting Sioux crest and local dasher/ribbon boards
[*] 3D positional goal horn and fight songs ("Stand Up and Cheer", "Fight on Sioux")
[/list]

[b]Audio hotkeys (optional)[/b]
[code]
F6 - Goal horn
F7 - Stand Up and Cheer
F8 - Fight on Sioux
F9 - Stop PA audio
[/code]"""

open(ID_FILE, 'w').write('3826743382')

os.chdir('F:/SteamLibrary/steamapps/common/Puck')
dll = ctypes.CDLL('F:/SteamLibrary/steamapps/common/Puck/Puck_Data/Plugins/x86_64/steam_api64.dll')

err = ctypes.create_string_buffer(1024)
if dll.SteamAPI_InitFlat(err) != 0:
    raise RuntimeError(f"SteamAPI_InitFlat failed: {err.value}")

dll.SteamAPI_SteamUGC_v021.restype = ctypes.c_void_p
dll.SteamAPI_SteamUtils_v010.restype = ctypes.c_void_p
dll.SteamAPI_SteamRemoteStorage_v016.restype = ctypes.c_void_p
ugc = dll.SteamAPI_SteamUGC_v021()
utils = dll.SteamAPI_SteamUtils_v010()
rs = dll.SteamAPI_SteamRemoteStorage_v016()

# Clean up any leftover preview files in RemoteStorage so full 976 KB quota is free
gfc = dll.SteamAPI_ISteamRemoteStorage_GetFileCount
gfc.argtypes = [ctypes.c_void_p]
gfc.restype = ctypes.c_int
gfns = dll.SteamAPI_ISteamRemoteStorage_GetFileNameAndSize
gfns.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(ctypes.c_int)]
gfns.restype = ctypes.c_char_p
fdel = dll.SteamAPI_ISteamRemoteStorage_FileDelete
fdel.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
fdel.restype = ctypes.c_bool

for i in range(gfc(rs) - 1, -1, -1):
    sz = ctypes.c_int()
    nm = gfns(rs, i, ctypes.byref(sz))
    if nm and b'preview' in nm:
        print("Deleting stale RemoteStorage file:", nm.decode(), fdel(rs, nm))

# Delete the temporary duplicate item 3826744188
del_item = dll.SteamAPI_ISteamUGC_DeleteItem
del_item.argtypes = [ctypes.c_void_p, ctypes.c_uint64]
del_item.restype = ctypes.c_uint64
del_item(ugc, 3826744188)

is_done = dll.SteamAPI_ISteamUtils_IsAPICallCompleted
is_done.argtypes = [ctypes.c_void_p, ctypes.c_uint64, ctypes.POINTER(ctypes.c_bool)]
is_done.restype = ctypes.c_bool

get_res = dll.SteamAPI_ISteamUtils_GetAPICallResult
get_res.argtypes = [ctypes.c_void_p, ctypes.c_uint64, ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.c_bool)]
get_res.restype = ctypes.c_bool

pub_id = 3826743382
start_upd = dll.SteamAPI_ISteamUGC_StartItemUpdate
start_upd.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint64]
start_upd.restype = ctypes.c_uint64
upd = start_upd(ugc, APP_ID, pub_id)

def set_str(fn_name, val):
    fn = getattr(dll, fn_name)
    fn.argtypes = [ctypes.c_void_p, ctypes.c_uint64, ctypes.c_char_p]
    fn.restype = ctypes.c_bool
    return fn(ugc, upd, val.encode('utf-8'))

print("SetItemTitle:", set_str('SteamAPI_ISteamUGC_SetItemTitle', TITLE))
print("SetItemDescription:", set_str('SteamAPI_ISteamUGC_SetItemDescription', DESC))
print("SetItemContent:", set_str('SteamAPI_ISteamUGC_SetItemContent', os.path.abspath(CONTENT_DIR)))
print("SetItemPreview:", set_str('SteamAPI_ISteamUGC_SetItemPreview', os.path.abspath(PREVIEW_IMG)))

set_vis = dll.SteamAPI_ISteamUGC_SetItemVisibility
set_vis.argtypes = [ctypes.c_void_p, ctypes.c_uint64, ctypes.c_int]
set_vis.restype = ctypes.c_bool
print("SetItemVisibility (Public=0):", set_vis(ugc, upd, 0))

submit = dll.SteamAPI_ISteamUGC_SubmitItemUpdate
submit.argtypes = [ctypes.c_void_p, ctypes.c_uint64, ctypes.c_char_p]
submit.restype = ctypes.c_uint64
sub_call = submit(ugc, upd, b'Initial release of Ralph Engelstad Arena (Fighting Sioux)')

prog = dll.SteamAPI_ISteamUGC_GetItemUpdateProgress
prog.argtypes = [ctypes.c_void_p, ctypes.c_uint64, ctypes.POINTER(ctypes.c_uint64), ctypes.POINTER(ctypes.c_uint64)]
prog.restype = ctypes.c_int

failed = ctypes.c_bool(False)
done_b = ctypes.c_uint64()
total_b = ctypes.c_uint64()
last_status = -1
t0 = time.time()
while time.time() - t0 < 240:
    dll.SteamAPI_RunCallbacks()
    st = prog(ugc, upd, ctypes.byref(done_b), ctypes.byref(total_b))
    if st != last_status or total_b.value > 0:
        print(f"Upload progress: status={st} ({done_b.value // 1024} / {total_b.value // 1024} KB)")
        last_status = st
    if is_done(utils, sub_call, ctypes.byref(failed)):
        buf = ctypes.create_string_buffer(24)
        get_res(utils, sub_call, buf, 24, 3404, ctypes.byref(failed))
        res_code, legal, out_id = struct.unpack('<i?3xQ', buf.raw[:16])
        print(f"SubmitItemUpdate: eResult={res_code}, legal={legal}, publishedFileId={out_id}")
        print(f"URL: https://steamcommunity.com/sharedfiles/filedetails/?id={pub_id}")
        break
    time.sleep(0.5)

dll.SteamAPI_Shutdown()
