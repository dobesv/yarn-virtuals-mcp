export default function normalizeLineEndings(text) {
    return text.replace(/\r\n/g, '\n');
}
