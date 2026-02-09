import fs from "fs/promises";

export default async function readFileContent(filePath, encoding = 'utf-8') {
    return await fs.readFile(filePath, encoding);
}
