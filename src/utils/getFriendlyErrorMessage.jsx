export default function getFriendlyErrorMessage(error){
  const rawMessage = String(error?.message ??error ??"").trim();
  const code = String(error?.code ?? "").toLowerCase();
  if (!navigator.onLine || code.includes("network") || rawMessage.toLowerCase().includes("network")){
    return "Connessione assente o instabile. Controlla Internet e riprova.";
  }
  if (code.includes("permission-denied") ||rawMessage.toLowerCase().includes("permission")){
    return "Non hai il permesso di eseguire questa operazione.";
  }
  if (code.includes("unavailable")){
    return "Il servizio online è temporaneamente non disponibile. Riprova tra poco.";
  }
  if(code.includes("unauthenticated")){
    return "La sessione non è disponibile. Ricarica la pagina e riprova.";
  }

  if(code.includes("deadline-exceeded")){
    return "La richiesta ha impiegato troppo tempo. Controlla la connessione e riprova.";
  }

  if(!rawMessage){
    return "Si è verificato un problema imprevisto. Riprova.";
  }
  return rawMessage;
}
