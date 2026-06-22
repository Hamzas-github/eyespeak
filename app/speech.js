// Output adapter — speaks text aloud via the Web Speech API.

export function speak(text){
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}
