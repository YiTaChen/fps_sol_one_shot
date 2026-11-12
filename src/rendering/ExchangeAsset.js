import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import exchangeUrl from '../assets/ash-exchange.glb?url';

export async function loadExchangeAsset() {
  try {
    const asset = await new GLTFLoader().loadAsync(exchangeUrl);
    asset.scene.name = 'Ash Exchange exterior';
    return asset.scene;
  } catch (error) {
    console.warn('Ash Exchange mesh could not be loaded.', error);
    return null;
  }
}
