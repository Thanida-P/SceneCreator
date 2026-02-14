import * as THREE from 'three';
import { FurnitureItem } from './FurnitureItem';
import { Transform } from './Base3DObject';
import { fetchWeatherData, WeatherData } from '../../utils/WeatherService';
 
const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 320;
const PANEL_WIDTH = 0.5;
const PANEL_HEIGHT = PANEL_WIDTH * (CANVAS_HEIGHT / CANVAS_WIDTH);
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
 
export class WeatherWidget extends FurnitureItem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private canvasTexture: THREE.CanvasTexture;
  private weatherData: WeatherData | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private isLoading: boolean = true;
 
  constructor(
    id: string,
    initialTransform?: Partial<Transform>
  ) {
    super(
      id,
      'Weather Widget',
      -1, // No backend model
      null, // No model path
      {
        description: 'Live weather forecast display',
        category: 'Widgets',
        type: 'weather_widget',
        isContainer: false,
        wallMountable: true,
      },
      initialTransform
    );
 
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvasTexture = new THREE.CanvasTexture(this.canvas);
    this.canvasTexture.minFilter = THREE.LinearFilter;
    this.canvasTexture.magFilter = THREE.LinearFilter;
 
    this.buildPanel();
    this.renderLoadingState();
    this.loadWeather();
 
    this.refreshTimer = setInterval(() => {
      this.loadWeather();
    }, REFRESH_INTERVAL_MS);
  }
 
  private buildPanel(): void {
    this.modelGroup.clear();
 
    const frameGeometry = new THREE.BoxGeometry(
      PANEL_WIDTH + 0.02,
      PANEL_HEIGHT + 0.02,
      0.015
    );
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.3,
      metalness: 0.6,
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    this.modelGroup.add(frame);
 
    const screenGeometry = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: this.canvasTexture,
      toneMapped: false,
    });
    const screen = new THREE.Mesh(screenGeometry, screenMaterial);
    screen.position.z = 0.009;
    this.modelGroup.add(screen);
  }
 
  private async loadWeather(): Promise<void> {
    try {
      this.isLoading = true;
      this.renderLoadingState();
      this.weatherData = await fetchWeatherData();
      this.isLoading = false;
      this.renderWeatherDisplay();
    } catch (err) {
      console.error('WeatherWidget: failed to fetch weather', err);
      this.isLoading = false;
      this.renderErrorState();
    }
  }
 
  private renderLoadingState(): void {
    const ctx = this.ctx;
    this.clearCanvas('#0f172a');
 
    ctx.fillStyle = '#94a3b8';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Loading weather...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
 
    this.canvasTexture.needsUpdate = true;
  }
 
  private renderErrorState(): void {
    const ctx = this.ctx;
    this.clearCanvas('#1e1b2e');
 
    ctx.fillStyle = '#ef4444';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Weather unavailable', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
 
    this.canvasTexture.needsUpdate = true;
  }
 
  private renderWeatherDisplay(): void {
    if (!this.weatherData) return;
    const ctx = this.ctx;
    const w = this.weatherData;
 
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    if (w.isDay) {
      gradient.addColorStop(0, '#1e3a5f');
      gradient.addColorStop(1, '#0f172a');
    } else {
      gradient.addColorStop(0, '#0c0c1d');
      gradient.addColorStop(1, '#1a1a2e');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
 
    // Location name
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(w.locationName, 30, 40);
 
    // Weather icon (large)
    ctx.font = '72px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(w.weatherIcon, 30, 140);
 
    // Temperature
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${w.temperature}${w.temperatureUnit}`, CANVAS_WIDTH - 30, 130);
 
    // Description
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(w.weatherDescription, 30, 195);
 
    // Divider
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 220);
    ctx.lineTo(CANVAS_WIDTH - 30, 220);
    ctx.stroke();
 
    // Bottom stats
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Humidity: ${w.humidity}%`, 30, 260);
    ctx.fillText(`Wind: ${w.windSpeed} km/h`, 30, 290);
 
    this.canvasTexture.needsUpdate = true;
  }
 
  private clearCanvas(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
 
  // Override: no GLTF to fetch
  protected async fetchModel(_path: string): Promise<THREE.Group> {
    return new THREE.Group();
  }
 
  protected setupModel(_model: THREE.Group): void {
    // Panel is already built in constructor
  }
 
  protected onModelLoaded(_model: THREE.Group): void {
    // No-op
  }
 
  protected onModelLoadError(_error: unknown): void {
    // No-op
  }
 
  // Override loadModel to skip GLTF loading
  async loadModel(_scene: THREE.Scene): Promise<void> {
  }
 
  update(delta: number): void {
    super.update(delta);
  }
 
  clone(): WeatherWidget {
    return new WeatherWidget(`${this.id}-${Date.now()}`, {
      position: this.getPosition(),
      rotation: this.getRotation(),
      scale: this.getScale(),
    });
  }
 
  serialize(): Record<string, unknown> {
    return {
      ...super.serialize(),
      widget_type: 'weather',
    };
  }
 
  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.canvasTexture.dispose();
    super.dispose();
  }
}