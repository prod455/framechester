declare module 'basecoat-css/basecoat';
declare module 'basecoat-css/tabs';
interface Window {
  basecoat?: { initAll: () => void; start: () => void };
}
