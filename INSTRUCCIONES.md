# Cómo instalar tu App en iPhone

Ya tienes la aplicación creada en `f:/Users/Carlos/Desktop/warner/top`. Para usarla en tu iPhone como una app nativa, sigue estos pasos:

## 1. Servir la App

Como es una aplicación web (PWA), necesitas "servirla" desde tu PC para que tu iPhone pueda verla.
No basta con abrir el archivo, necesitas un servidor local.

### Opción VS Code (Recomendada)

1. Instala la extensión "Live Server".
2. Dale al botón **"Go Live"** en la esquina inferior derecha de VS Code.
3. Fíjate en el puerto que aparece (normalmente **5500**).

## 2. Conectar desde el iPhone

1. Asegúrate de que tu iPhone y tu PC están en la **misma red Wi-Fi**.
2. Averigua la **IP de tu PC** (en la terminal de Windows escribe `ipconfig` y busca "Dirección IPv4", suele ser tipo `192.168.1.XX`).
3. En el navegador de tu iPhone (Chrome o Safari), escribe:
   `http://TU_IP_V4:5500`
   _(Ejemplo: http://192.168.1.35:5500)_

## 3. Instalar (Añadir a Inicio)

Para que se vea sin barras de navegación (como una app real):

### En Safari (Icono Brújula)

1. Botón **Compartir** (cuadrado con flecha arriba).
2. Baja y pulsa **"Añadir a la pantalla de inicio"**.

### En Chrome

1. Botón **Compartir** (icono de cuadradito con flecha, suele estar arriba a la derecha en la barra de direcciones).
2. Busca y pulsa **"Añadir a la pantalla de inicio"**.

¡Listo! Abre el nuevo icono "Top Coasters" en tu menú y disfruta de la app a pantalla completa.
