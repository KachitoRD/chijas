export async function auditButtons(page) {
  return page.locator("button:visible").evaluateAll(buttons => {
    const parseColor = value => (value.match(/[\d.]+/g) || []).map(Number);
    const luminance = color => color.slice(0, 3).map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    return buttons.flatMap(button => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    const faults = [];
    if (!["flex", "inline-flex"].includes(style.display) || style.alignItems !== "center" || style.justifyContent !== "center") {
      faults.push(`${button.id || button.textContent}: texto sin centrado flex`);
    }
    if (rect.height < 44 || rect.width < 44) faults.push(`${button.id || button.textContent}: target menor de 44px`);
    if (!button.disabled) {
      const ancestors = [];
      for (let element = button; element; element = element.parentElement) ancestors.unshift(element);
      const background = ancestors.reduce((base, element) => {
        const color = parseColor(getComputedStyle(element).backgroundColor);
        const alpha = color[3] ?? 1;
        return base.map((channel, index) => color[index] * alpha + channel * (1 - alpha));
      }, [255, 255, 255]);
      const foreground = parseColor(style.color);
      const alpha = foreground[3] ?? 1;
      const text = foreground.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
      const values = [luminance(text), luminance(background)].sort((a, b) => b - a);
      const ratio = (values[0] + 0.05) / (values[1] + 0.05);
      if (ratio < 4.5) faults.push(`${button.id || button.textContent}: contraste ${ratio.toFixed(2)}:1 inferior a 4.5:1`);
    }
    if (button.childNodes.length === 1 && button.firstChild.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      range.selectNodeContents(button);
      const text = range.getBoundingClientRect();
      if (Math.abs(text.x + text.width / 2 - rect.x - rect.width / 2) > 2
        || Math.abs(text.y + text.height / 2 - rect.y - rect.height / 2) > 3) {
        faults.push(`${button.id || button.textContent}: texto fuera del centro geométrico`);
      }
    }
    return faults;
    });
  });
}
