/**
 * Thin wrapper around the DOM HUD/overlays. Keeps main.js clean.
 */
export class UI {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      touch: document.getElementById('touch-controls'),
      title: document.getElementById('title-screen'),
      howto: document.getElementById('howto-screen'),
      gameover: document.getElementById('gameover-screen'),
      bloodFill: document.getElementById('blood-fill'),
      staminaFill: document.getElementById('stamina-fill'),
      healthFill: document.getElementById('health-fill'),
      score: document.getElementById('score-value'),
      danger: document.getElementById('danger-fill'),
      alert: document.getElementById('alert-banner'),
      toast: document.getElementById('toast'),
      context: document.getElementById('context-hint'),
      titleHigh: document.getElementById('title-highscore'),
    };
    this._toastTimer = null;
    this._curAlert = null;
  }

  showHUD(v) { this.el.hud.classList.toggle('hidden', !v); }
  showTouch(v) { this.el.touch.classList.toggle('hidden', !v); }
  showTitle(v) { this.el.title.classList.toggle('hidden', !v); }
  showHowto(v) { this.el.howto.classList.toggle('hidden', !v); }

  setHighScore(s) { this.el.titleHigh.textContent = s; }

  updateHUD(s) {
    this.el.bloodFill.style.width = `${(s.blood/s.maxBlood)*100}%`;
    this.el.staminaFill.style.width = `${(s.stamina/s.maxStamina)*100}%`;
    this.el.healthFill.style.width = `${(s.health/s.maxHealth)*100}%`;
    this.el.score.textContent = s.score;
    this.el.danger.style.width = `${Math.min(100, s.danger)}%`;
  }

  alert(text) {
    if (text === this._curAlert) return;
    this._curAlert = text;
    if (!text) { this.el.alert.classList.add('hidden'); return; }
    this.el.alert.textContent = text;
    this.el.alert.classList.remove('hidden');
  }

  toast(text, dur = 1500) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    // restart animation
    this.el.toast.style.animation = 'none';
    void this.el.toast.offsetWidth;
    this.el.toast.style.animation = '';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), dur);
  }

  contextHint(text) {
    if (!text) { this.el.context.classList.add('hidden'); return; }
    if (this.el.context.textContent !== text) this.el.context.textContent = text;
    this.el.context.classList.remove('hidden');
  }

  showGameOver(v, data) {
    this.el.gameover.classList.toggle('hidden', !v);
    if (!v || !data) return;
    document.getElementById('gameover-title').textContent = data.title || '☠️ ゲームオーバー';
    document.getElementById('gameover-reason').textContent = data.reason || '';
    document.getElementById('final-score').textContent = data.score;
    document.getElementById('final-bites').textContent = data.bites;
    document.getElementById('final-time').textContent = data.time + 's';
    document.getElementById('final-eggs').textContent = data.eggs;
    const hs = document.getElementById('gameover-highscore');
    hs.textContent = data.isNewHigh ? `🏆 新記録！ ハイスコア ${data.highScore}` : `ハイスコア: ${data.highScore}`;
    hs.style.color = data.isNewHigh ? '#ffd166' : '#9aa0b8';
  }
}
