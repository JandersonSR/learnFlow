// Caminhos de carreira: a ordem recomendada de estudo para cada objetivo.
//
// Cada carreira tem etapas, e cada etapa lista as trilhas na ordem em que
// devem ser estudadas. Use o NOME DO ARQUIVO da trilha (sem .html), igual ao
// que está em conteudo/. O build avisa se algum nome não existir.
//
//   estudar:  trilhas da etapa, na ordem
//   consulta: material de apoio da etapa (abrir quando precisar, não estudar inteiro)
//   meta:     o critério para considerar a etapa concluída

export const CARREIRAS = [
  {
    id: "staff",
    nome: "Staff Engineer e Arquiteto",
    resumo: "De sênior a Staff: entrevista de sênior alto e big tech, sistemas distribuídos, IA aplicada no capstone e escopo de Staff no trabalho.",
    duracao: "6 meses · ~7 h por semana",
    etapas: [
      {
        nome: "Base de entrevista",
        meta: "Resolver problemas médios de algoritmo em 30 min, conduzir um system design de 45 min e ter currículo e histórias STAR prontos.",
        estudar: ["high level", "Vol 07 - Algoritmos e Estruturas de Dados", "Vol 06 - System Design", "Vol 19 - Carreira e Entrevistas"],
        consulta: ["Vol 20 - Roteiro Mestre de 24 Meses"],
      },
      {
        nome: "Entrevistas e sistemas distribuídos",
        meta: "Candidaturas em andamento; explicar consenso, replicação e consistência com exemplos; revisar Vol 6, 7 e 19 por padrão.",
        estudar: ["Nova - Sistemas Distribuídos a Fundo"],
        consulta: ["Nova - Redes, SO e Concorrência", "Vol 01 - Mensageria e Caches"],
      },
      {
        nome: "IA aplicada e capstone",
        meta: "Capstone publicado com RAG, avaliação e custos medidos.",
        estudar: ["Vol 15 - Engenharia de IA Aplicada a Fundo", "Nova - Projeto Final Integrador"],
        consulta: ["Nova - Arquitetura SaaS Multi-tenant", "Vol 14 - Segurança de Aplicações"],
      },
      {
        nome: "Escopo de Staff e prova pública",
        meta: "Uma RFC entre times, um diagnóstico com números e o capstone apresentado.",
        estudar: ["Vol 22 - Staff Engineer e Arquitetura Evolutiva", "code cookbook", "Nova - Performance, Carga e Caos"],
        consulta: ["Vol 18 - Negócios e Produto para Engenheiros", "Cert - AZ-305 Azure Solutions Architect"],
      },
    ],
  },
  {
    id: "backend",
    nome: "Backend Sênior (Node e .NET)",
    resumo: "O núcleo que toda vaga sênior de backend cobra: runtime, bancos, mensageria, observabilidade, segurança e a ponte de Node para C#.",
    duracao: "3 a 4 meses",
    etapas: [
      {
        nome: "Fundamentos do runtime e do código",
        meta: "Explicar event loop, thread pool e GC; escrever código testável com as boas práticas do time.",
        estudar: ["Vol 04 - Runtimes e Linguagens", "Trilha Node e TypeScript", "Vol 16 - Fundamentos de Engenharia de Software"],
      },
      {
        nome: "Dados",
        meta: "Ler um plano de execução, escolher índices e o nível de isolamento certo.",
        estudar: ["Vol 03 - Bancos de Dados", "Bancos de Dados a Fundo"],
      },
      {
        nome: "Ecossistema .NET",
        meta: "Migrar uma API de Node para ASP.NET com EF Core e testes.",
        estudar: ["Nova - De Node e Typescript para CSharp e ASP.NET", "Trilha C# e ASP.NET Core"],
      },
      {
        nome: "Sistemas em produção",
        meta: "Consumidor idempotente com DLQ, métricas RED e as falhas do OWASP corrigidas.",
        estudar: ["Vol 01 - Mensageria e Caches", "Kafka e Event Hubs com .NET", "Vol 13 - Observabilidade na Prática", "Vol 14 - Segurança de Aplicações"],
        consulta: ["Cert - Confluent Kafka Developer e Administrator"],
      },
      {
        nome: "Entrevista",
        meta: "System design de 45 min e histórias STAR prontas.",
        estudar: ["Vol 06 - System Design", "Vol 07 - Algoritmos e Estruturas de Dados", "Vol 19 - Carreira e Entrevistas"],
      },
    ],
  },
  {
    id: "ia",
    nome: "Especialista em IA Aplicada",
    resumo: "Da base de ML ao produto com IA em empresa: Python, LLMs, RAG, agentes, avaliação, governança e as certificações de IA da Azure.",
    duracao: "4 a 6 meses",
    etapas: [
      {
        nome: "Fundamentos",
        meta: "Treinar um modelo simples, explicar transformers e escrever uma API em Python.",
        estudar: ["Nova - Python para Backend e IA", "Nova - ML e Deep Learning", "Cert - AI-901 Azure AI Fundamentals"],
      },
      {
        nome: "Engenharia de IA",
        meta: "RAG híbrido com permissões, agentes com ferramentas e avaliação no CI.",
        estudar: ["Vol 15 - Engenharia de IA Aplicada a Fundo", "Trilha de IA Aplicada", "Cert - AI-200 Azure AI Cloud Developer"],
        consulta: ["Vol 17 - Dados e Analytics"],
      },
      {
        nome: "IA no desenvolvimento",
        meta: "Fluxo do time com agentes de código, especificações e revisão.",
        estudar: ["Vol 09 - LLMs no Desenvolvimento em Equipe", "Vol 23 - Desenvolvimento Assistido por IA Avançado"],
      },
      {
        nome: "IA corporativa e produto",
        meta: "Um caso de IA com ROI medido, guardrails e governança.",
        estudar: ["Vol 24 - IA Corporativa Avançada", "Cert - AI-103 Azure AI Apps and Agents", "Nova - Projeto Final Integrador"],
        consulta: ["Vol 18 - Negócios e Produto para Engenheiros", "Vol 14 - Segurança de Aplicações"],
      },
    ],
  },
  {
    id: "techlead",
    nome: "Tech Lead e Gestão",
    resumo: "Liderar um time técnico: qualidade, pessoas, entrega, comunicação com o negócio e o caminho para Staff.",
    duracao: "3 meses",
    etapas: [
      {
        nome: "Base técnica do time",
        meta: "Padrões de código, revisão e observabilidade definidos para o time.",
        estudar: ["Vol 16 - Fundamentos de Engenharia de Software", "Vol 13 - Observabilidade na Prática"],
      },
      {
        nome: "Liderar pessoas",
        meta: "1:1 semanal, feedback no formato SCI e plano de 90 dias.",
        estudar: ["Vol 21 - Tech Lead na Prática", "Tech Lead na Prática"],
      },
      {
        nome: "Entregar com o time",
        meta: "Fluxo com limite de WIP, status semanal e IA no fluxo do time.",
        estudar: ["Vol 10 - Gestão de Projetos e Equipes", "Vol 09 - LLMs no Desenvolvimento em Equipe"],
      },
      {
        nome: "Negócio e próximo nível",
        meta: "Business case de uma iniciativa técnica e uma RFC aprovada.",
        estudar: ["Vol 18 - Negócios e Produto para Engenheiros", "Vol 22 - Staff Engineer e Arquitetura Evolutiva"],
        consulta: ["code cookbook", "Vol 19 - Carreira e Entrevistas"],
      },
    ],
  },
  {
    id: "cloud",
    nome: "Cloud, DevOps e Plataforma",
    resumo: "Azure de ponta a ponta com IaC, Kubernetes e pipelines, mais AWS para multicloud, na ordem das certificações.",
    duracao: "4 a 6 meses",
    etapas: [
      {
        nome: "Base de cloud",
        meta: "Explicar IAM, rede e contêineres; passar na AZ-104.",
        estudar: ["Vol 05 - Cloud", "Cert - AZ-104 Azure Administrator"],
      },
      {
        nome: "Infra como código e Kubernetes",
        meta: "Cluster AKS criado por Terraform com deploy automatizado.",
        estudar: ["Terraform AKS e Event Hubs", "AKS na Prática com .NET", "Cert - CKA Kubernetes Administrator"],
      },
      {
        nome: "Pipelines e operação",
        meta: "Pipeline com segurança, deploy progressivo e SLO com alerta por burn rate.",
        estudar: ["Cert - AZ-400 Azure DevOps Engineer", "Vol 13 - Observabilidade na Prática", "Nova - Performance, Carga e Caos"],
      },
      {
        nome: "Arquitetura e multicloud",
        meta: "Passar na AZ-305; desenhar a mesma solução em AWS.",
        estudar: ["Cert - AZ-305 Azure Solutions Architect", "Nova - AWS na Prática", "Cert - AWS Solutions Architect Associate"],
        consulta: ["Nova - Arquitetura SaaS Multi-tenant"],
      },
    ],
  },
  {
    id: "seguranca",
    nome: "Segurança de Aplicações e Cloud",
    resumo: "Do código seguro à arquitetura de cibersegurança: OWASP, redes, identidade, operações de segurança e as certificações SC da Microsoft.",
    duracao: "4 a 5 meses",
    etapas: [
      {
        nome: "Aplicação segura",
        meta: "Modelagem de ameaças com STRIDE e as falhas do OWASP corrigidas com teste.",
        estudar: ["Vol 14 - Segurança de Aplicações", "Segurança de Aplicação"],
      },
      {
        nome: "Redes e infraestrutura",
        meta: "Explicar TLS, TCP e segmentação de rede.",
        estudar: ["Nova - Redes, SO e Concorrência", "Vol 05 - Cloud"],
      },
      {
        nome: "Segurança em cloud",
        meta: "Passar na SC-500; caçar ameaças com KQL e configurar acesso condicional.",
        estudar: ["Cert - SC-500 Cloud and AI Security Engineer", "Cert - SC-200 e SC-300 SecOps e Identidade"],
      },
      {
        nome: "Arquitetura de segurança",
        meta: "Desenho Zero Trust de uma solução completa.",
        estudar: ["Cert - SC-100 Cybersecurity Architect"],
      },
    ],
  },
  {
    id: "dados",
    nome: "Dados e Analytics",
    resumo: "Do banco transacional ao analytics: modelagem, pipelines, Fabric, Power BI e a ponte para ML.",
    duracao: "3 a 5 meses",
    etapas: [
      {
        nome: "Bancos e SQL",
        meta: "Consultas analíticas com CTE e funções de janela; ler planos de execução.",
        estudar: ["Vol 03 - Bancos de Dados", "Bancos de Dados a Fundo"],
      },
      {
        nome: "Engenharia de dados",
        meta: "Pipeline ELT com testes de qualidade e modelo dimensional.",
        estudar: ["Vol 17 - Dados e Analytics", "Engenharia de Dados", "Nova - Python para Backend e IA"],
      },
      {
        nome: "Plataforma e BI",
        meta: "Passar na DP-700 e na PL-300.",
        estudar: ["Cert - DP-700 Fabric Data Engineer", "Cert - PL-300 Power BI Data Analyst"],
      },
      {
        nome: "Ponte para ML",
        meta: "Um modelo simples treinado sobre os seus dados.",
        estudar: ["Nova - ML e Deep Learning"],
      },
    ],
  },
  {
    id: "bigtech",
    nome: "Entrevistas de Big Tech",
    resumo: "O recorte do que cai em processos de big tech: algoritmos, system design, fundamentos de sistemas e comportamental.",
    duracao: "3 meses",
    etapas: [
      {
        nome: "Método e algoritmos",
        meta: "Problemas médios em 30 minutos, falando em voz alta.",
        estudar: ["high level", "Vol 07 - Algoritmos e Estruturas de Dados"],
      },
      {
        nome: "System design",
        meta: "Conduzir um design de 45 minutos com estimativas.",
        estudar: ["Vol 06 - System Design", "Nova - Sistemas Distribuídos a Fundo"],
      },
      {
        nome: "Fundamentos que aparecem nas perguntas",
        meta: "Responder sobre concorrência, rede e desempenho sem hesitar.",
        estudar: ["Nova - Redes, SO e Concorrência", "Nova - Performance, Carga e Caos"],
      },
      {
        nome: "Comportamental e oferta",
        meta: "8 histórias STAR e a negociação ensaiada.",
        estudar: ["Vol 19 - Carreira e Entrevistas"],
      },
    ],
  },
  {
    id: "fullstack",
    nome: "Full-stack (reforço de frontend)",
    resumo: "Para quem é forte no backend e quer fechar a lacuna do frontend moderno.",
    duracao: "2 a 3 meses",
    etapas: [
      {
        nome: "Navegador e frontend moderno",
        meta: "Explicar renderização, Core Web Vitals e estado no React.",
        estudar: ["Vol 02 - Frontend", "Frontend React e Angular"],
      },
      {
        nome: "Ponta a ponta",
        meta: "Uma aplicação completa com API tipada, autenticação e testes.",
        estudar: ["Trilha Node e TypeScript", "Vol 14 - Segurança de Aplicações"],
        consulta: ["Vol 12 - Ferramentas e Integrações do Mercado"],
      },
    ],
  },
  {
    id: "fundador",
    nome: "Fundador e empresa própria",
    resumo: "Transformar conhecimento técnico em negócio: validação, SaaS, integrações, um nicho e um produto com IA.",
    duracao: "3 meses, em paralelo ao emprego",
    etapas: [
      {
        nome: "Negócio",
        meta: "Nicho escolhido e oferta validada com conversas reais.",
        estudar: ["Vol 11 - Criar Sua Empresa de Tecnologia", "Vol 18 - Negócios e Produto para Engenheiros"],
      },
      {
        nome: "Produto",
        meta: "SaaS multi-tenant com pagamentos e integrações funcionando.",
        estudar: ["Nova - Arquitetura SaaS Multi-tenant", "Vol 12 - Ferramentas e Integrações do Mercado"],
        consulta: ["Vol 08 - Asterisk e Telefonia"],
      },
      {
        nome: "Diferencial com IA",
        meta: "Um piloto pago com IA.",
        estudar: ["Vol 15 - Engenharia de IA Aplicada a Fundo", "Nova - Projeto Final Integrador"],
      },
    ],
  },
];
