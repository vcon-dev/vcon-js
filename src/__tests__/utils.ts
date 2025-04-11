import fs from 'fs';
import path from 'path';
import { Vcon } from '../vcon';

export const TEST_VCONS_DIR = path.join(__dirname, '../../test-vcons');

export function loadTestVcon(directory: string, filename: string): Vcon {
    const filePath = path.join(TEST_VCONS_DIR, directory, filename);
    const vconData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return new Vcon(vconData);
}

export function getAllTestVcons(): Vcon[] {
    const vcons: Vcon[] = [];
    const directories = fs.readdirSync(TEST_VCONS_DIR);
    
    for (const dir of directories) {
        if (dir === '.DS_Store') continue;
        
        const dirPath = path.join(TEST_VCONS_DIR, dir);
        if (fs.statSync(dirPath).isDirectory()) {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                if (file.endsWith('.vcon.json')) {
                    vcons.push(loadTestVcon(dir, file));
                }
            }
        }
    }
    
    return vcons;
}

export function getTestVconsByDirectory(directory: string): Vcon[] {
    const vcons: Vcon[] = [];
    const dirPath = path.join(TEST_VCONS_DIR, directory);
    
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            if (file.endsWith('.vcon.json')) {
                vcons.push(loadTestVcon(directory, file));
            }
        }
    }
    
    return vcons;
} 