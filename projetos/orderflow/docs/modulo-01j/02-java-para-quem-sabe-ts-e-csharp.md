# 1J.2 Java para quem sabe TypeScript e C#

C# nasceu, em boa parte, inspirado em Java. Você vai reconhecer 80% de tudo. Esta folha foca nos 20%
que são diferentes e que **mordem**. Todos os trechos foram compilados e executados no JDK 25.

## Tabela de tradução

| C# | Java | Observação |
|---|---|---|
| `var x = 10;` | `var x = 10;` | Igual (Java 10+), só para variáveis locais |
| `record Item(string Sku, int Qty);` | `record Item(String sku, int qty) {}` | Acessores são `sku()`, não `Sku` |
| `item with { Qty = 5 }` | (não existe) | Escreva um método `withQty(int)` ou use um builder |
| `string?` / nullable | `Optional<T>` no retorno; JSpecify `@Nullable` em parâmetros | **O compilador Java não rastreia null** |
| `decimal` | `BigDecimal` | É uma **classe**: `a.add(b)`, não `a + b` |
| `Task<T>` + `async/await` | código bloqueante simples + **threads virtuais** | Lição 1J.7 |
| `CancellationToken` | interrupção da thread (`Thread.interrupt()`) | |
| LINQ `Where/Select/ToList` | Streams `filter/map/toList` | `list.stream().filter(...).map(...).toList()` |
| `interface IRepo` | `interface PaymentRepository` | Sem o prefixo `I` (convenção Java) |
| propriedade `{ get; private set; }` | campo `private` + método `status()` ou `getStatus()` | Java não tem propriedades |
| `switch` com padrões de tipo | `switch` com padrões + `sealed interface` | Exaustivo, sem `default` |
| `_` (descarte) | `_` (Java 22+) | `case Paid(var id, _) ->` |
| `$"Olá {nome}"` | `"Olá %s".formatted(nome)` | Java não tem interpolação de string |
| `"""raw"""` | `"""` text block `"""` | Multilinha (Java 15+) |
| namespace livre | `package` = pasta | `com/orderflow/payments/domain/Payment.java` |
| vários tipos públicos num arquivo | **um tipo público por arquivo**, com o mesmo nome | |
| `sealed class` (não herdável) | `final class` | `sealed` em Java significa outra coisa: hierarquia fechada |
| `ConcurrentDictionary.GetOrAdd` | `ConcurrentHashMap.putIfAbsent` / `computeIfAbsent` | |

## As pegadinhas que mordem

### 1. `==` compara referência, não valor

```java
String s1 = "oi", s2 = new String("oi");
s1 == s2;          // false: são objetos diferentes
s1.equals(s2);     // true

Integer x = 127, y = 127, z = 1000, w = 1000;
x == y;            // true  (!!) o Java guarda em cache os Integer de -128 a 127
z == w;            // false (!!) fora do cache, são objetos diferentes
z.equals(w);       // true
```

No C#, `==` em string compara valor, e `int` é sempre valor. Em Java, **`==` em objeto quase sempre
é bug**. O teste com 127 passa, o de produção com 1000 falha. Use `.equals()` ou `Objects.equals(a, b)`
(que também trata null).

### 2. `BigDecimal`: três armadilhas

```java
0.1 + 0.2                                          // 0.30000000000000004 (double)
new BigDecimal("0.1").add(new BigDecimal("0.2"))   // 0.3 ✅

new BigDecimal(0.2)        // 0.200000000000000011102230246251565404236316680908203125 ❌
new BigDecimal("0.2")      // 0.2 ✅  sempre construa a partir de String

new BigDecimal("10.0").equals(new BigDecimal("10.00"))         // false ❌ equals compara a escala
new BigDecimal("10.0").compareTo(new BigDecimal("10.00")) == 0  // true ✅
```

O `Payment` normaliza o valor para 2 casas na entrada exatamente para fugir da terceira.

### 3. Null: você está por conta própria

O C# com `<Nullable>enable</Nullable>` avisa no build. O compilador Java **não**. Ferramentas:

- **`Optional<T>`** para retorno de "pode não existir" (`findById`). Não use em campo nem parâmetro.
- **`Objects.requireNonNull(x, "x")`** na entrada de métodos públicos: falha cedo e com nome.
- **JSpecify** (`@Nullable`, `@NullMarked`): anotações padrão que o **Spring Framework 7** (base do
  Boot 4) adotou na API inteira. IntelliJ e ferramentas como NullAway usam isso para avisar.

### 4. Exceções verificadas (checked)

Java tem algo que C# e TS não têm: exceções que o compilador **obriga** a tratar ou declarar.

```java
queue.put(event);   // não compila: "unreported exception InterruptedException"
```

Regras práticas de mercado:
- Regra de negócio: exceção **não verificada** (`extends RuntimeException`), como `DomainException`.
  O próprio Spring segue essa linha.
- `InterruptedException`: **nunca engula**. Restaure a flag com `Thread.currentThread().interrupt()`
  antes de converter (veja `QueuePaymentEventPublisher`). Engolir impede o shutdown de parar a thread.
- `catch (Exception e) {}` vazio é o pior anti-padrão Java em code review.

### 5. Coleções imutáveis lançam em runtime

```java
List.of(1).add(2);   // compila, mas lança UnsupportedOperationException
```

`List.of`, `Map.of`, `Stream.toList()` e `List.copyOf` devolvem listas imutáveis. Não existe
`IReadOnlyList` separado: o tipo é `List` e o erro só aparece ao rodar.

## Recursos modernos que você vai usar (Java 21 a 25)

```java
// sealed + record patterns + switch exaustivo (o "discriminated union" do Java)
sealed interface Shape permits Circle, Square {}
record Circle(double radius) implements Shape {}
record Square(double side) implements Shape {}

double area(Shape s) {
    return switch (s) {
        case Circle(double r) -> Math.PI * r * r;
        case Square(double side) -> side * side;
    };   // sem default: se surgir um Shape novo, para de compilar
}

// guardas com "when" e case null
String classify(Object o) {
    return switch (o) {
        case Integer i when i > 100 -> "inteiro grande";
        case Integer i -> "inteiro";
        case String str -> "texto de " + str.length();
        case null -> "nulo";
        default -> "outro";
    };
}

// coleções com ordem: getFirst()/getLast() (Java 21)
var lista = new ArrayList<>(List.of("a", "b"));
lista.getFirst();   // "a"

// Streams = LINQ
nums.stream().filter(n -> n % 2 == 0).map(n -> n * 10).toList();   // [20, 40]
nums.stream().collect(Collectors.partitioningBy(n -> n > 2));      // {false=[1, 2], true=[3, 4]}
```

E, no Java 25, um arquivo pode ser só isto (ótimo para scripts e para estudar):

```java
// Main25.java  →  rode com: java Main25.java
void main() {
    IO.println("Olá do Java 25 sem classe nem static");
}
```

Próxima: [1J.3 O domínio em Java puro](03-dominio-em-java.md)
