"""Generate original, synthesized HERO combat SFX WAV assets (no external samples)."""
from pathlib import Path
import wave
import numpy as np
from scipy.signal import butter, sosfilt

HERE = Path(__file__).resolve().parent
# Works both from this asset-authoring folder and when copied into <project>/tools/.
if (HERE / 'public' / 'audio').is_dir() or not (HERE.parent / 'public' / 'audio').is_dir():
    OUT = HERE / 'public' / 'audio'
else:
    OUT = HERE.parent / 'public' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)
SR = 24000
rng = np.random.default_rng(20261020)

def filt(x, lo=None, hi=None, order=3):
    ny = SR * 0.5
    if lo is not None and hi is not None:
        sos = butter(order, [max(20, lo), min(ny - 100, hi)], btype='bandpass', fs=SR, output='sos')
    elif lo is not None:
        sos = butter(order, max(20, lo), btype='highpass', fs=SR, output='sos')
    elif hi is not None:
        sos = butter(order, min(ny - 100, hi), btype='lowpass', fs=SR, output='sos')
    else:
        return x
    return sosfilt(sos, x).astype(np.float32)

def env_exp(t, attack=0.002, decay=0.05, release=0.0):
    a = 1 - np.exp(-t / max(1e-5, attack))
    d = np.exp(-t / max(1e-5, decay))
    e = a * d
    if release:
        # very soft tail envelope blend
        e += 0.12 * np.exp(-t / release)
    return e.astype(np.float32)

def norm(x, peak=0.88):
    x = np.asarray(x, dtype=np.float32)
    mx = float(np.max(np.abs(x))) if len(x) else 0
    if mx > 1e-9:
        x = x * (peak / mx)
    return np.clip(np.tanh(x * 1.18), -0.98, 0.98)

def write(name, x):
    x = norm(x)
    pcm = (x * 32767).astype('<i2')
    with wave.open(str(OUT / name), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(pcm.tobytes())
    print(f'{name:28} {len(x)/SR:5.2f}s {len(pcm)*2/1024:7.1f}KB')

def gun(name, duration, low_hz, low_decay, crack_amount, body_amount, bright=4000, echo=0.0, metal=0.0):
    n = int(SR * duration); t = np.arange(n, dtype=np.float32) / SR
    white = rng.normal(0, 1, n).astype(np.float32)
    # A low, rapidly falling pressure wave.
    f = low_hz * (0.45 + 0.55 * np.exp(-t * 22))
    phase = 2 * np.pi * np.cumsum(f) / SR
    thump = np.sin(phase) * env_exp(t, 0.0008, low_decay)
    low_noise = filt(white, hi=500) * env_exp(t, 0.001, low_decay * 0.75)
    # Short, bright muzzle crack + broader firearm-body noise.
    crack = filt(white, 900, bright) * env_exp(t, 0.00045, 0.010 + duration * 0.04)
    body = filt(rng.normal(0, 1, n).astype(np.float32), 180, min(2600, bright)) * env_exp(t, 0.0018, duration * 0.19)
    tail = filt(rng.normal(0, 1, n).astype(np.float32), 260, 1800) * env_exp(t, 0.008, duration * 0.3)
    click = np.zeros(n, dtype=np.float32)
    if metal:
        # metallic bolt/rattle after the impulse, shaped as tiny damped resonances
        for delay, hz, amp, decay in [(0.022, 1750, .5, .018), (.046, 980, .35, .027), (.075, 2350, .22, .018)]:
            ix = int(delay * SR)
            if ix < n:
                tt = np.arange(n-ix, dtype=np.float32) / SR
                click[ix:] += amp * np.sin(2*np.pi*hz*tt) * np.exp(-tt/decay)
    y = 0.52*thump + 0.32*low_noise + crack_amount*crack + body_amount*body + 0.12*tail + metal*0.13*click
    if echo:
        # short reflected shots: filtered low tail, reduced amplitude
        for delay, amount, lp in [(echo, .24, 2400), (echo*1.75, .12, 1300), (echo*2.7, .06, 900)]:
            ix = int(delay*SR)
            if ix < n:
                echo_src = filt(y[:-ix] if ix else y, hi=lp) if ix else y
                y[ix:ix+len(echo_src)] += echo_src * amount
    write(name, y)

def mechanical(name, pattern, duration=0.32):
    n = int(SR*duration); y=np.zeros(n,dtype=np.float32)
    for delay, hz, amp, decay, band in pattern:
        ix=int(delay*SR)
        if ix>=n: continue
        ln=n-ix; t=np.arange(ln,dtype=np.float32)/SR
        e=np.exp(-t/decay)
        tonal=np.sin(2*np.pi*hz*t + 0.03*np.sin(2*np.pi*23*t))*e
        noise=filt(rng.normal(0,1,ln).astype(np.float32), max(80,hz*0.35), min(10000,hz*3.2))*e
        y[ix:] += amp*(0.42*tonal + 0.58*noise)
    write(name,y)

def radio_voice(name, kind='alert', duration=.48):
    n=int(SR*duration); t=np.arange(n,dtype=np.float32)/SR
    # Two short voiced bursts with drifting pitch/formants, wrapped in radio squelch.
    if kind == 'alert':
        gate=((t>.055)&(t<.18)) | ((t>.23)&(t<.37))
        pitch=142 - 24*np.clip(t/duration,0,1) + 7*np.sin(2*np.pi*7*t)
        grit=.34
    elif kind == 'hurt':
        gate=(t>.025)&(t<.30); pitch=126 - 42*np.clip(t/.3,0,1); grit=.5
    else:
        gate=(t>.04)&(t<duration*.67); pitch=138 - 63*np.clip(t/(duration*.7),0,1); grit=.46
    phase=2*np.pi*np.cumsum(pitch)/SR
    voiced=np.zeros(n,dtype=np.float32)
    for h,a in [(1,1.0),(2,.45),(3,.25),(4,.16),(6,.08)]:
        form=filt(np.sin(phase*h).astype(np.float32), 180, 3200)
        # Vowels filtered by broad formants with a slight metallic/radio profile.
        voiced += a*form
    pulse=(0.68 + .32*np.sin(2*np.pi*(19+4*np.sin(2*np.pi*1.8*t))*t))
    voiced *= gate.astype(np.float32)*pulse*env_exp(t, .008, .18)
    stat=filt(rng.normal(0,1,n).astype(np.float32), 700, 5700)
    squelch=env_exp(t,.002,.035) + .26*env_exp(np.maximum(0,t-.38),.004,.025)
    y=.52*voiced + grit*.24*stat*squelch
    # hard radio gate / mild saturation
    y=np.tanh(y*2.4)
    write(name,y)

def footstep(name, surface='dirt'):
    duration=.24; n=int(SR*duration); t=np.arange(n,dtype=np.float32)/SR
    white=rng.normal(0,1,n).astype(np.float32)
    if surface=='metal':
        thump=np.sin(2*np.pi*(115*np.exp(-t*12)+42)*t)*env_exp(t,.001,.052)
        clank=filt(white, 700, 6500)*env_exp(t,.0006,.028)
        ring=np.sin(2*np.pi*520*t)*env_exp(t,.001,.09)
        y=.42*thump+.62*clank+.11*ring
    else:
        thump=filt(white,40,420)*env_exp(t,.002,.065)
        grit=filt(rng.normal(0,1,n).astype(np.float32),600,8000)*env_exp(t,.002,.026)
        y=.72*thump+.35*grit
    write(name,y)

# Distinct, original weapon reports.
gun('gun-ak.wav', .30, 132, .050, .95, .56, 5600, .0, .38)
gun('gun-m4.wav', .24, 156, .038, 1.0, .42, 7800, .0, .20)
gun('gun-awp.wav', .92, 93, .095, 1.16, .72, 6200, .105, .18)
gun('gun-smg.wav', .19, 174, .030, .90, .35, 8500, .0, .24)
gun('gun-shotgun.wav', .43, 102, .080, .80, .68, 5100, .0, .12)
gun('gun-pistol.wav', .20, 184, .032, 1.04, .30, 9100, .0, .15)
gun('gun-heli.wav', .17, 112, .038, .52, .54, 3600, .0, .05)
# Filtered, low-level report reflection: used sparingly for distant enemy fire, never as a ricochet ping.
gun('gun-echo.wav', .34, 88, .085, .28, .22, 2600, .035, .0)

# Rocket ignition, explosions, impacts and movement.
mechanical('rocket-launch.wav', [(0.0,72,.75,.13,1),(0.018,420,.44,.10,1),(0.035,1450,.24,.12,1),(.09,190,.28,.20,1)], .48)
# Explosions combine deep impulse, broadband debris, and controlled tail.
def explosion(name, duration, bass, tail):
    n=int(SR*duration); t=np.arange(n,dtype=np.float32)/SR
    w=rng.normal(0,1,n).astype(np.float32)
    low=filt(w, hi=230)*env_exp(t,.002,tail*.65)
    mid=filt(rng.normal(0,1,n).astype(np.float32),100,1900)*env_exp(t,.001,duration*.24)
    high=filt(rng.normal(0,1,n).astype(np.float32),500,10000)*env_exp(t,.0007,.045)
    f=bass*(.4+.6*np.exp(-t*10)); phase=2*np.pi*np.cumsum(f)/SR
    boom=np.sin(phase)*env_exp(t,.001,tail)
    y=.72*boom+.48*low+.34*mid+.18*high
    # low, sparse environmental tail
    for delay,amp,cut in [(.08,.2,1400),(.17,.11,900),(.29,.055,650)]:
        ix=int(delay*SR)
        if ix<n: y[ix:] += amp*filt(y[:-ix],hi=cut) if ix else amp*y
    write(name,y)
explosion('explosion-small.wav',.58,79,.18)
explosion('explosion-large.wav',1.15,54,.39)
mechanical('impact-armor.wav', [(0,1780,.72,.022,1),(.012,740,.58,.038,1),(.036,2450,.28,.018,1)], .15)
mechanical('impact-flesh.wav', [(0,105,.46,.045,1),(.006,330,.24,.028,1),(.015,720,.16,.02,1)], .13)
mechanical('ricochet.wav', [(0,380,.16,.07,1),(.006,2350,.7,.13,1),(.018,4150,.42,.10,1)], .23)
footstep('footstep-dirt.wav','dirt')
footstep('footstep-metal.wav','metal')
mechanical('jump.wav', [(0,220,.24,.055,1),(.018,950,.12,.045,1)], .13)
mechanical('land.wav', [(0,64,.78,.09,1),(.004,180,.34,.055,1),(.014,850,.14,.035,1)], .24)
mechanical('reload-rifle-start.wav', [(0,.0+920,.24,.018,1),(.035,470,.60,.03,1),(.075,1240,.38,.018,1),(.15,240,.30,.045,1)], .29)
mechanical('reload-rifle-end.wav', [(0,610,.32,.03,1),(.022,1520,.44,.018,1),(.055,350,.64,.035,1)], .17)
mechanical('reload-shotgun-start.wav', [(0,440,.22,.03,1),(.045,700,.45,.04,1),(.11,950,.3,.035,1),(.19,520,.4,.04,1)], .36)
mechanical('reload-shotgun-end.wav', [(0,540,.22,.025,1),(.025,1560,.42,.016,1),(.07,265,.62,.045,1)], .19)
radio_voice('radio-alert.wav','alert',.48)
radio_voice('enemy-grunt.wav','hurt',.38)
radio_voice('enemy-death.wav','death',.68)
# Player wound grunt: breathy and less radio-distorted than enemy squad barks.
def player_grunt():
    duration=.36; n=int(SR*duration); t=np.arange(n,dtype=np.float32)/SR
    pitch=172*np.exp(-t*3.7)+58
    phase=2*np.pi*np.cumsum(pitch)/SR
    voiced=np.sin(phase)+.32*np.sin(phase*2.03)+.12*np.sin(phase*3.1)
    voiced=filt(voiced.astype(np.float32), 90, 1500)
    breath=filt(rng.normal(0,1,n).astype(np.float32), 500, 4600)
    env=env_exp(t,.014,.115) * np.clip(1-t/duration,0,1)
    write('player-grunt.wav', .78*voiced*env + .18*breath*env)
player_grunt()
# Drone warning: rapid rising whine over a thin air rush.
mechanical('drone-dive.wav', [(0,260,.24,.12,1),(.02,420,.31,.17,1),(.045,760,.26,.16,1),(.075,1180,.14,.13,1)], .34)
# A close, constant loop for helicopter rotors + engine. Phase components are periodic; crossfade random tail onto head.
duration=4.0; n=int(SR*duration); t=np.arange(n,dtype=np.float32)/SR
rotor_rate=18.0
rotor_env=.28+.72*(.5+.5*np.cos(2*np.pi*rotor_rate*t))**2
# Engine harmonic body and a band-limited, chopped air texture.
engine=.34*np.sin(2*np.pi*43*t)+.20*np.sin(2*np.pi*86*t+.3)+.09*np.sin(2*np.pi*129*t+.8)
noise=filt(rng.normal(0,1,n).astype(np.float32),60,950)
chop=noise*rotor_env
blade=.12*np.sin(2*np.pi*rotor_rate*t)+.055*np.sin(2*np.pi*rotor_rate*2*t)
heli=.43*engine+.36*chop+.18*blade
# Fade/crossfade the random texture into a seamless loop.
xn=int(SR*.12); fade=np.linspace(0,1,xn,dtype=np.float32); fade=.5-.5*np.cos(np.pi*fade)
tail=heli[-xn:]; head=heli[:xn]
blend=tail*(1-fade)+head*fade
heli_loop=np.concatenate([blend,heli[xn:-xn]]).astype(np.float32)
write('helicopter-loop.wav',heli_loop)

# Seamless low-level environmental beds. They are intentionally quiet and broad,
# supporting combat without competing with dialogue, reloads or gun reports.
def ambience(name, scene, duration=6.0):
    n=int(SR*duration); t=np.arange(n,dtype=np.float32)/SR
    w1=rng.normal(0,1,n).astype(np.float32)
    w2=rng.normal(0,1,n).astype(np.float32)
    if scene == 'wild':
        low=filt(w1, 45, 420); air=filt(w2, 280, 2200)
        gust=.52+.20*np.sin(2*np.pi*.17*t)+.10*np.sin(2*np.pi*.31*t+.9)
        drone=.16*np.sin(2*np.pi*48*t)+.06*np.sin(2*np.pi*96*t+.3)
        y=.53*low*gust+.20*air*(.7+.3*np.sin(2*np.pi*.23*t))+drone
    elif scene == 'roof':
        wind=filt(w1, 90, 800); hum=.20*np.sin(2*np.pi*58*t)+.12*np.sin(2*np.pi*116*t+.2)+.08*np.sin(2*np.pi*174*t+.6)
        city=filt(w2, 420, 3600)*(.55+.18*np.sin(2*np.pi*.22*t))
        y=.36*wind+.24*city+hum
    elif scene == 'room':
        low=filt(w1, 38, 260); mid=filt(w2, 240, 1200)
        hum=.21*np.sin(2*np.pi*50*t)+.16*np.sin(2*np.pi*100*t+.25)+.08*np.sin(2*np.pi*150*t+.65)
        pulse=.86+.10*np.sin(2*np.pi*.11*t)
        y=.44*low*pulse+.16*mid+hum
    elif scene == 'desert':
        wind=filt(w1, 55, 520); sand=filt(w2, 750, 5200)
        gust=.48+.23*np.sin(2*np.pi*.12*t+.3)+.14*np.sin(2*np.pi*.20*t+1.7)
        y=.58*wind*gust+.13*sand*(.72+.28*np.sin(2*np.pi*.15*t))+.05*np.sin(2*np.pi*40*t)
    else: # tropic: warm low wind + fine insect-like shimmer; no sharp bird loop that gets annoying.
        wind=filt(w1, 100, 900); insects=filt(w2, 1800, 6200)
        trem=.55+.25*np.sin(2*np.pi*3.7*t)+.10*np.sin(2*np.pi*5.1*t+.7)
        y=.43*wind+.12*insects*trem+.07*np.sin(2*np.pi*62*t)
    # Crossfade the last 180ms into the head so loop playback has no hard click.
    xn=int(SR*.18); f=np.linspace(0,1,xn,dtype=np.float32); f=.5-.5*np.cos(np.pi*f)
    cross=y[-xn:]*(1-f)+y[:xn]*f
    y=np.concatenate([cross, y[xn:-xn]]).astype(np.float32)
    write(name,y)

ambience('ambient-wild.wav','wild')
ambience('ambient-roof.wav','roof')
ambience('ambient-room.wav','room')
ambience('ambient-desert.wav','desert')
ambience('ambient-tropic.wav','tropic')
print('Generated all original procedural sound assets in',OUT)
