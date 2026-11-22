import { getDocument, GlobalWorkerOptions, TextLayer } from './vendor/pdfjs/pdf.min.mjs';

const vendor = new URL('./vendor/pdfjs/', import.meta.url);
GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', vendor).href;
const documents = new Map();

function loadDocument(file) {
  if (!documents.has(file)) {
    const task = getDocument({
      url: new URL(file, import.meta.url).href,
      cMapUrl: new URL('cmaps/', vendor).href,
      cMapPacked: true,
      standardFontDataUrl: new URL('standard_fonts/', vendor).href,
      useWasm: false,
      isEvalSupported: false,
    });
    documents.set(file, task.promise.catch(error => {
      documents.delete(file);
      throw error;
    }));
  }
  return documents.get(file);
}

class PdfCard extends HTMLElement {
  static observedAttributes = ['data-card'];

  connectedCallback() {
    this.fallback = this.querySelector('img');
    this.surface = document.createElement('div');
    this.surface.className = 'pdf-surface';
    this.surface.hidden = true;
    this.status = document.createElement('p');
    this.status.className = 'pdf-status';
    this.status.setAttribute('role','status');
    this.status.hidden = true;
    this.append(this.surface, this.status);
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(this);
    this.draw();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.generation = (this.generation || 0) + 1;
    this.task?.cancel();
  }

  attributeChangedCallback() {
    if (!this.surface) return;
    this.surface.hidden = true;
    this.fallback.hidden = false;
    this.lastDraw = '';
    this.status.hidden = true;
    this.draw();
  }

  async draw() {
    const card = this.dataset.card;
    const width = this.clientWidth;
    if (!width || !card) return;
    const key = card + ':' + width;
    if (key === this.lastDraw) return;
    this.lastDraw = key;
    if (this.surface.hidden && !this.fallback.hasAttribute('src')) {
      this.status.textContent = '正在加载题面…';
      this.status.hidden = false;
    }
    const generation = this.generation = (this.generation || 0) + 1;
    this.task?.cancel();
    const [deck, side, number] = card.split(':');
    try {
      const pdf = await loadDocument(`assets/${deck}-${side}-cards.pdf`);
      const page = await pdf.getPage(Number(number));
      if (generation !== this.generation) return;
      const viewport = page.getViewport({scale: width / page.getViewport({scale:1}).width});
      const pixelRatio = Math.min(Math.max(devicePixelRatio, 1.5), 3,
        Math.sqrt(14000000 / (viewport.width * viewport.height)));
      const drawing = document.createElement('canvas');
      drawing.width = Math.max(1, Math.round(viewport.width * pixelRatio));
      drawing.height = Math.max(1, Math.round(viewport.height * pixelRatio));
      drawing.setAttribute('aria-hidden', 'true');
      const task = this.task = page.render({
        canvas: drawing,
        viewport,
        transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
      });
      await task.promise;
      if (generation !== this.generation) return;

      const layer = document.createElement('div');
      layer.className = 'textLayer';
      layer.style.setProperty('--total-scale-factor', viewport.scale);
      this.surface.style.height = viewport.height + 'px';
      this.surface.replaceChildren(drawing, layer);
      this.surface.hidden = false;
      this.status.hidden = true;
      this.fallback.hidden = true;

      const text = await page.getTextContent();
      if (generation !== this.generation) return;
      // Merged pages clip their graphics. Exclude text baselines outside the card
      // so that selection does not copy adjacent questions.
      text.items = text.items.filter(item => {
        if (!item.transform) return false;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        return x + Math.abs(item.width) * viewport.scale >= 0 && x < viewport.width &&
          y >= 0 && y <= viewport.height;
      });
      await new TextLayer({textContentSource:text, container:layer, viewport}).render();
    } catch (error) {
      if (generation !== this.generation || error.name === 'RenderingCancelledException') return;
      if (this.surface.hidden && !this.fallback.hasAttribute('src')) {
        this.status.textContent = '题面加载失败，请刷新重试。';
        this.status.hidden = false;
      }
      console.warn('PDF card unavailable', error);
    }
  }
}

customElements.define('pdf-card', PdfCard);
