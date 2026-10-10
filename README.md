# AppMusica — Audio a MIDI

Sube una canción y la app detecta **qué teclas se están tocando**: las muestra en un
piano roll, las ilumina en un teclado mientras suena y te deja descargar el **MIDI**.

Todo corre **en tu Mac, gratis y sin internet** (después de instalar).

## Cómo abrirla

Doble clic en **`iniciar.command`**. Se abre el navegador en http://127.0.0.1:8765.
Para cerrarla, cierra la ventana de Terminal que se abrió.

> La primera vez macOS puede decir que no puede verificar el archivo:
> clic derecho → **Abrir** → **Abrir**.

## Modos

| Modo | Qué hace | Úsalo para |
|---|---|---|
| **Canción completa** | Demucs separa piano, guitarra, bajo, voz, batería y otros; luego saca las notas de cada uno | Canciones con banda |
| **Solo piano** | Transcribe directo con el modelo de piano de ByteDance | Grabaciones de piano solo (lo más preciso) |
| **Un solo instrumento** | Transcribe directo con Basic Pitch | Guitarra, voz, flauta, violín… |

## Qué puedes hacer con el resultado

- **Piano roll:** cada barra es una nota. Clic para saltar a ese momento; rueda o arrastre para moverte; Ctrl + rueda para hacer zoom.
- **Teclado:** se iluminan las teclas presionadas, con el color de cada instrumento.
- **Secuencia de notas:** lista con tiempo, nota (C4 / Do4), duración y fuerza. Clic en una fila para saltar.
- **Escuchar:** la canción original o solo un instrumento separado. Sube **Sonido MIDI** para oír las notas detectadas y comparar.
- **Ocultar notas débiles:** quita notas falsas de poca fuerza. También se aplica al MIDI que descargas.
- **Descargar MIDI:** todo junto (una pista por instrumento) o cada instrumento por separado.
- **Barra espaciadora:** reproducir / pausar.

## Modelos de IA (todos gratuitos y de código abierto)

- **Demucs `htdemucs_6s`** (Meta): separación de instrumentos. Usa la GPU del Mac.
- **Basic Pitch** (Spotify): transcripción de cualquier instrumento.
- **piano_transcription** (ByteDance): transcripción de piano de alta precisión.

## Archivos

```
app/pipeline.py      separación + transcripción
app/server.py        servidor local (FastAPI)
app/static/          interfaz web
models/              modelo de piano de ByteDance
data/jobs/           tus canciones procesadas (audios separados, MIDI, notas)
instalar.sh          reinstala todo desde cero
iniciar.command      abre la app
```

## Limitaciones

- No es 100% perfecto: en partes muy cargadas aparecen notas falsas o faltan algunas.
- Piano y guitarra se separan peor que voz, bajo y batería.
- La batería se separa, pero no se convierte en notas.
