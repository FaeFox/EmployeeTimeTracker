// socketClient.js
const socket = io('http://' + document.domain + ':' + location.port, {
    transports: ['websocket'],
    upgrade: false,
});

export {
    socket
};