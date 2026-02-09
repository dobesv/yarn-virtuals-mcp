let allowedDirectories = [];

export function setAllowedDirectories(directories) {
    allowedDirectories = [...directories];
}

export default function getAllowedDirectories() {
    return [...allowedDirectories];
}
