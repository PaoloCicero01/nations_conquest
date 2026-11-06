export const player_list = [
    {
        id: "player 1",
        name: "Player-1",
        color: "red",
        bonus_def: 0,
        activated_def: false,
        in_game: true
    },
    {
        id: "player 2",
        name: "Player-2",
        color: "blue",
        bonus_def: 0,
        activated_def: false,
        in_game: true
    },
    {
        id: "player 3",
        name: "Player-3",
        color: "yellow",
        bonus_def: 0,
        activated_def: false,
        in_game: true
    },
    {
        id: "player 4",
        name: "Player-4",
        color: "green",
        bonus_def: 0,
        activated_def: false,
        in_game: true
    }
]

export const territory_list = [
    {
        id: "valle-aosta",
        name: "Valle d'Aosta",
        owner: "",
        troops : 0,
        adjacent_territory : ["piemonte"] 
    },
    {
        id: "piemonte",
        name: "Piemonte",
        owner: "",
        troops : 0,
        adjacent_territory : ["valle-aosta","lombardia","emilia-romagna","liguria"]
    },
    {
        id: "liguria",
        name: "Liguria",
        owner: "",
        troops : 0,
        adjacent_territory : ["piemonte","emilia-romagna","toscana"]
    },
    {
        id: "lombardia",
        name: "Lombardia",
        owner: "",
        troops : 0,
        adjacent_territory : ["piemonte","trentino-alto-adige","veneto","emilia-romagna"]
    },
    {
        id: "trentino-alto-adige",
        name: "Trentino-Alto Adige",
        owner: "",
        troops : 0,
        adjacent_territory : ["lombardia","veneto"]
    },
    {
        id: "veneto",
        name: "Veneto",
        owner: "",
        troops : 0,
        adjacent_territory : ["trentino-alto-adige","lombardia","emilia-romagna","friuli-venezia-giulia"]
    },
      {
        id: "friuli-venezia-giulia",
        name: "Friuli Venezia Giulia",
        owner: "",
        troops : 0,
        adjacent_territory : ["veneto"] 
    },
    {
        id: "toscana",
        name: "Toscana",
        owner: "",
        troops : 0,
        adjacent_territory : ["liguria","emilia-romagna","marche","umbria","lazio","sardegna"]
    },
    {
        id: "umbria",
        name: "Umbria",
        owner: "",
        troops : 0,
        adjacent_territory: ["toscana","marche","lazio"]
    },
    {
        id:"lazio",
        name:"Lazio",
        owner: "",
        troops : 0,
        adjacent_territory:["toscana","umbria","marche","abruzzo","molise","campania","sardegna"]
    },
    {
        id:"abruzzo",
        name:"Abruzzo",
        owner: "",
        troops : 0,
        adjacent_territory: ["marche","lazio","molise"]
    },
    {
        id:"puglia",
        name:"Puglia",
        owner: "",
        troops : 0,
        adjacent_territory:["molise","campania","basilicata"]
    },
    {
        id:"molise",
        name:"Molise",
        owner: "",
        troops : 0,
        adjacent_territory:["abruzzo","lazio","campania","puglia"]
    },
    {
        id:"basilicata",
        name:"Basilicata",
        owner: "",
        troops : 0,
        adjacent_territory: ["campania","puglia","calabria"]
    },
    {
        id:"calabria",
        name:"Calabria",
        owner: "",
        troops : 0,
        adjacent_territory:["sicilia","basilicata"]
    },
    {
        id:"sicilia",
        name:"Sicilia",
        owner: "",
        troops : 0,
        adjacent_territory:["calabria","sardegna"]
    },
    {
        id:"sardegna",
        name:"Sardegna",
        owner: "",
        troops : 0,
        adjacent_territory:["toscana","lazio", "sicilia"]
    },
    {
        id:"emilia-romagna",
        name:"Emilia Romagna",
        owner: "",
        troops : 0,
        adjacent_territory:["piemonte","lombardia","veneto","liguria","toscana","marche"]
    },
    {
        id:"marche",
        name:"Marche",
        owner: "",
        troops : 0,
        adjacent_territory:["emilia-romagna","toscana","umbria","lazio","abruzzo"]
    },
    {
        id : "campania",
        name : "Campania",
        owner: "",
        troops : 0,
        adjacent_territory : ["lazio","molise","puglia","basilicata"]
    }
]

