# 23 种设计模式的代码示例

## 一、创建型模式

### 1、工厂方法

侧重于创建**单一**产品的实例，客户端只需要依赖于工厂接口，而不需要关心具体的产品实现，灵活性高。

```java
// 产品接口
interface Shape {
    void draw();
}

// 具体产品 - 圆形
class Circle implements Shape {
    @Override
    public void draw() {
        System.out.println("Drawing a Circle");
    }
}

// 具体产品 - 矩形
class Rectangle implements Shape {
    @Override
    public void draw() {
        System.out.println("Drawing a Rectangle");
    }
}

// 工厂接口
interface ShapeFactory {
    Shape createShape();
}

// 具体工厂 - 圆形工厂
class CircleFactory implements ShapeFactory {
    @Override
    public Shape createShape() {
        return new Circle();
    }
}

// 具体工厂 - 矩形工厂
class RectangleFactory implements ShapeFactory {
    @Override
    public Shape createShape() {
        return new Rectangle();
    }
}

// 客户端代码
public class Client {
    public static void main(String[] args) {
        ShapeFactory circleFactory = new CircleFactory();
        Shape circle = circleFactory.createShape();
        circle.draw();  // 输出: Drawing a Circle

        ShapeFactory rectangleFactory = new RectangleFactory();
        Shape rectangle = rectangleFactory.createShape();
        rectangle.draw();  // 输出: Drawing a Rectangle
    }
}

```

### 2、抽象工厂

侧重于创建**多个/一组**相关产品的实例，确保客户端获得的一组对象能够在一起工作，保证产品之间的一致性和相互依赖性。

```java
// 产品接口 - 形状
interface Shape {
    void draw();
}

// 具体产品 - 圆形
class Circle implements Shape {
    @Override
    public void draw() {
        System.out.println("Drawing a Circle");
    }
}

// 具体产品 - 矩形
class Rectangle implements Shape {
    @Override
    public void draw() {
        System.out.println("Drawing a Rectangle");
    }
}

// 产品接口 - 颜色
interface Color {
    void fill();
}

// 具体产品 - 红色
class Red implements Color {
    @Override
    public void fill() {
        System.out.println("Filling with Red Color");
    }
}

// 具体产品 - 蓝色
class Blue implements Color {
    @Override
    public void fill() {
        System.out.println("Filling with Blue Color");
    }
}

// 抽象工厂
interface AbstractFactory {
    Shape createShape();
    Color createColor();
}

// 具体工厂 - 圆形和红色工厂
class RedShapeFactory implements AbstractFactory {
    @Override
    public Shape createShape() {
        return new Circle();
    }

    @Override
    public Color createColor() {
        return new Red();
    }
}

// 具体工厂 - 矩形和蓝色工厂
class BlueShapeFactory implements AbstractFactory {
    @Override
    public Shape createShape() {
        return new Rectangle();
    }

    @Override
    public Color createColor() {
        return new Blue();
    }
}

// 客户端代码
public class Client {
    public static void main(String[] args) {
        AbstractFactory redFactory = new RedShapeFactory();
        Shape redCircle = redFactory.createShape();
        Color redColor = redFactory.createColor();
        redCircle.draw();  // 输出: Drawing a Circle
        redColor.fill();   // 输出: Filling with Red Color

        AbstractFactory blueFactory = new BlueShapeFactory();
        Shape blueRectangle = blueFactory.createShape();
        Color blueColor = blueFactory.createColor();
        blueRectangle.draw();  // 输出: Drawing a Rectangle
        blueColor.fill();      // 输出: Filling with Blue Color
    }
}

```

### 3、建造者模式（Builder 模式）

建造者模式主要用于构建复杂对象的过程，使得对象的构建过程更加灵活和可读（通常设计成支持链式调用）。建造者模式的核心思想是将对象的构建过程与其表示相分离，从而使得同样的构建过程可以创建出不同的对象表示。

```java
// 产品类 - Pizza
class Pizza {
    private String size; // 尺寸
    private boolean cheese; // 是否加奶酪
    private boolean pepperoni; // 是否加意大利香肠
    private boolean mushrooms; // 是否加蘑菇

    public Pizza(String size, boolean cheese, boolean pepperoni, boolean mushrooms) {
        this.size = size;
        this.cheese = cheese;
        this.pepperoni = pepperoni;
        this.mushrooms = mushrooms;
    }

    @Override
    public String toString() {
        return "Pizza{" +
                "size='" + size + '\'' +
                ", cheese=" + cheese +
                ", pepperoni=" + pepperoni +
                ", mushrooms=" + mushrooms +
                '}';
    }
}

// Builder 类
class PizzaBuilder {
    private String size;
    private boolean cheese;
    private boolean pepperoni;
    private boolean mushrooms;

    public PizzaBuilder setSize(String size) {
        this.size = size;
        return this;
    }

    public PizzaBuilder addCheese() {
        this.cheese = true;
        return this;
    }

    public PizzaBuilder addPepperoni() {
        this.pepperoni = true;
        return this;
    }

    public PizzaBuilder addMushrooms() {
        this.mushrooms = true;
        return this;
    }

    public Pizza build() {
        return new Pizza(size, cheese, pepperoni, mushrooms);
    }
}

// 客户端代码
public class Client {
    public static void main(String[] args) {
        Pizza pizza = new PizzaBuilder()
                .setSize("Large")
                .addCheese()
                .addPepperoni()
                .build();

        System.out.println(pizza); // 输出: Pizza{size='Large', cheese=true, pepperoni=true, mushrooms=false}
    }
}
```

### 4、原型模式

使用原型模式，可以从一个现有的对象复制所有属性，并得到一个新对象，而不需要重新设置每个属性。

```java
// 原型接口
interface Prototype {
    Prototype clone();
}

// 具体原型类
class ConcretePrototype implements Prototype {
    private String name;

    public ConcretePrototype(String name) {
        this.name = name;
    }

    @Override
    public Prototype clone() {
        return new ConcretePrototype(this.name);
    }

    @Override
    public String toString() {
        return "ConcretePrototype{name='" + name + "'}";
    }
}

// 客户端代码
public class PrototypePatternDemo {
    public static void main(String[] args) {
        ConcretePrototype original = new ConcretePrototype("Original");
        ConcretePrototype cloned = (ConcretePrototype) original.clone();

        System.out.println("Original: " + original);
        System.out.println("Cloned: " + cloned);
    }
}
```

### 5、单例模式

通过私有构造函数和静态方法（也可以称为**全局访问点**）如 `getInstance` 控制实例的创建，确保只有一个实例存在。它适用于需要控制实例数量的情况，比如配置管理器或线程池。

```java
// 单例类
class Singleton {
    private static Singleton instance;

    // 私有构造函数，防止外部实例化
    private Singleton() {}

    // 获取实例的公共方法
    public static Singleton getInstance() {
        if (instance == null) {
            instance = new Singleton();
        }
        return instance;
    }

    public void showMessage() {
        System.out.println("Hello from Singleton!");
    }
}

// 客户端代码
public class SingletonPatternDemo {
    public static void main(String[] args) {
        Singleton singleton = Singleton.getInstance();
        singleton.showMessage();
    }
}
```

## 二、结构型模式

### 1、 适配器模式

适配器模式（Adapter Pattern）是一种结构型设计模式，用于将一个类的接口（方法）转换成客户端期望的另一个接口（方法）。适配器模式可以让原本因接口不兼容而无法一起工作的类能够协同工作。

#### 1. 目标接口

```java
// 目标接口
interface Target {
    void request();
}
```

#### 2. 源类

```java
// 不兼容的源类
class Adaptee {
    public void specificRequest() {
        System.out.println("Called specificRequest from Adaptee.");
    }
}
```

#### 3. 适配器类

```java
// 适配器类
class Adapter implements Target {
    private Adaptee adaptee;

    public Adapter(Adaptee adaptee) {
        this.adaptee = adaptee;
    }

    @Override
    public void request() {
        // 调用源类的方法
        adaptee.specificRequest();
    }
}
```

#### 4. 客户端代码

```java
public class Client {
    public static void main(String[] args) {
        Adaptee adaptee = new Adaptee();
        Target adapter = new Adapter(adaptee);

        // 通过适配器调用
        adapter.request();
    }
}
```

在这个示例中：

- `Target` 是客户端期望的接口。
- `Adaptee` 是需要适配的现有类，提供了一个不兼容的接口（方法）。
- `Adapter` 类实现了 `Target` 接口，并在其 `request` 方法中调用了 `Adaptee` 的 `specificRequest` 方法，从而实现了接口的适配。

适配器模式的优势在于它能让不兼容的接口协同工作，从而提高系统的灵活性和可扩展性。

### 2、桥接模式

桥接模式（Bridge Pattern）是一种结构型设计模式，它通过将**抽象部分**与**实现部分**分离，使得二者可以独立变化。桥接模式通常用于避免在类层次中产生过多的子类。

#### 1. 接口

```java
// 要实现的接口
interface Implementor {
    void operationImpl();
}
```

#### 2. 具体实现类

```java
// 具体实现类 A
class ConcreteImplementorA implements Implementor {
    @Override
    public void operationImpl() {
        System.out.println("ConcreteImplementorA operation.");
    }
}

// 具体实现类 B
class ConcreteImplementorB implements Implementor {
    @Override
    public void operationImpl() {
        System.out.println("ConcreteImplementorB operation.");
    }
}
```

#### 3. 抽象类

```java
// 抽象类
abstract class Abstraction {
    protected Implementor implementor;

    protected Abstraction(Implementor implementor) {
        this.implementor = implementor;
    }

    public abstract void operation();
}
```

#### 4. 继承抽象类的具体类

```java
// 继承抽象类的具体类
class RefinedAbstraction extends Abstraction {
    public RefinedAbstraction(Implementor implementor) {
        super(implementor);
    }

    @Override
    public void operation() {
        System.out.print("RefinedAbstraction: ");
        implementor.operationImpl();
    }
}
```

#### 5. 客户端代码

```java
public class Client {
    public static void main(String[] args) {
        Implementor implementorA = new ConcreteImplementorA();
        Abstraction abstractionA = new RefinedAbstraction(implementorA);
        abstractionA.operation();

        Implementor implementorB = new ConcreteImplementorB();
        Abstraction abstractionB = new RefinedAbstraction(implementorB);
        abstractionB.operation();
    }
}
```

当运行 `Client` 类时，输出将是：

```
RefinedAbstraction: ConcreteImplementorA operation.
RefinedAbstraction: ConcreteImplementorB operation.
```

在这个示例中：

- `Implementor` 是要实现的接口。
- `ConcreteImplementorA` 和 `ConcreteImplementorB` 是具体实现类，提供了不同的实现。
- `Abstraction` 是抽象类，持有一个 `Implementor` 类型的引用。
- `RefinedAbstraction` 是具体的抽象类，扩展了 `Abstraction`，并实现了 `operation` 方法。

`Abstraction` 抽象类持有一个 `Implementor` 接口（即通过这个接口进行桥接）的引用，通过这个引用调用实现层的方法。在具体使用中，`Abstraction` 的实例可以在运行时选择不同的 `Implementor` 实现，而不需要修改自身的代码。

### 3、组合模式

组合模式（Composite Pattern）是一种结构型设计模式，允许将对象组合成树形结构来表示**部分-整体**层次结构。组合模式使得客户端对单个对象和组合对象的使用具有一致性。

下面是一个简单的组合模式示例代码，展示了如何使用组合模式来构建一个文件系统的结构，其中文件和文件夹都可以被视为组件。

```java
import java.util.ArrayList;
import java.util.List;

// 抽象组件
interface FileComponent {
    void showDetails();
}

// 叶子节点：文件
class File implements FileComponent {
    private String name;

    public File(String name) {
        this.name = name;
    }

    @Override
    public void showDetails() {
        System.out.println("File: " + name);
    }
}

// 组合节点：文件夹
class Folder implements FileComponent {
    private String name;
    private List<FileComponent> components = new ArrayList<>();

    public Folder(String name) {
        this.name = name;
    }

    public void add(FileComponent component) {
        components.add(component);
    }

    public void remove(FileComponent component) {
        components.remove(component);
    }

    @Override
    public void showDetails() {
        System.out.println("Folder: " + name);
        for (FileComponent component : components) {
            component.showDetails();
        }
    }
}

// 客户端代码
public class CompositePatternDemo {
    public static void main(String[] args) {
        // 创建文件和文件夹
        FileComponent file1 = new File("File1.txt");
        FileComponent file2 = new File("File2.txt");
        Folder folder1 = new Folder("Folder1");
        folder1.add(file1);
        folder1.add(file2);

        FileComponent file3 = new File("File3.txt");
        Folder folder2 = new Folder("Folder2");
        folder2.add(folder1);
        folder2.add(file3);

        // 显示结构
        folder2.showDetails();
    }
}
```

在这个示例中：

- `FileComponent`：抽象组件，定义了 `showDetails` 方法。
- `File`：叶子节点，代表具体的文件，具体实现 `showDetails` 方法。
- `Folder`：组合节点，代表文件夹，可以包含多个 `FileComponent` 对象（文件或文件夹）。实现了 `showDetails` 方法，递归调用子组件的 `showDetails` 方法。
- `CompositePatternDemo`：客户端代码，构建了一个文件夹和文件的层次结构，并展示了该结构的详细信息。

使用组合模式，可以以统一的方式对待单个对象和组合对象，客户端代码可以简单地处理复杂的树形结构，而无需关心具体的组件类型。

### 4、装饰器模式

装饰器模式主要是为了动态地给对象添加额外的职责或行为，而无需修改对象的代码。通常用于功能扩展，比如给一个基础对象添加附加功能（如添加配料）。

#### 1. 抽象组件

```java
// 抽象组件
interface Coffee {
    String getDescription();
    double cost();
}
```

#### 2. 具体组件

```java
// 具体组件
class SimpleCoffee implements Coffee {
    @Override
    public String getDescription() {
        return "Simple Coffee";
    }

    @Override
    public double cost() {
        return 2.00;
    }
}
```

#### 3. 装饰器抽象类

```java
// 装饰器抽象类，实现了接口，同时持有一个被装饰的对象
abstract class CoffeeDecorator implements Coffee {
    protected Coffee decoratedCoffee;

    public CoffeeDecorator(Coffee coffee) {
        this.decoratedCoffee = coffee;
    }

    @Override
    public String getDescription() {
        return decoratedCoffee.getDescription();
    }

    @Override
    public double cost() {
        return decoratedCoffee.cost();
    }
}
```

#### 4. 具体装饰器

```java
// 具体装饰器：添加牛奶
class MilkDecorator extends CoffeeDecorator {
    public MilkDecorator(Coffee coffee) {
        super(coffee);
    }

    @Override
    public String getDescription() {
        return decoratedCoffee.getDescription() + ", Milk";
    }

    @Override
    public double cost() {
        return decoratedCoffee.cost() + 0.50;
    }
}

// 具体装饰器：添加糖
class SugarDecorator extends CoffeeDecorator {
    public SugarDecorator(Coffee coffee) {
        super(coffee);
    }

    @Override
    public String getDescription() {
        return decoratedCoffee.getDescription() + ", Sugar";
    }

    @Override
    public double cost() {
        return decoratedCoffee.cost() + 0.20;
    }
}
```

#### 5. 使用示例

```java
public class CoffeeShop {
    public static void main(String[] args) {
        Coffee coffee = new SimpleCoffee();
        System.out.println(coffee.getDescription() + " $" + coffee.cost());

        // 对同一个咖啡对象添加不同的装饰器，形成不同的咖啡
        coffee = new MilkDecorator(coffee);
        System.out.println(coffee.getDescription() + " $" + coffee.cost());

        // 再次添加装饰器
        coffee = new SugarDecorator(coffee);
        System.out.println(coffee.getDescription() + " $" + coffee.cost());
    }
}
```

#### 输出结果

```
Simple Coffee $2.0
Simple Coffee, Milk $2.5
Simple Coffee, Milk, Sugar $2.7
```

在这个示例中，`Coffee` 接口定义了基本的咖啡行为，`SimpleCoffee` 是一个具体的实现。`CoffeeDecorator` 是一个实现了该接口的抽象类装饰器，并持有一个 `Coffee` 类型的引用。具体的装饰器（如 `MilkDecorator` 和 `SugarDecorator`）继承了 `CoffeeDecorator`，可以在要实现的接口方法里添加新的功能。

通过这种方式，可以在运行时灵活地组合不同的装饰器，而无需修改原始的 `SimpleCoffee` 类，从而实现对功能的动态扩展。

装饰器模式和桥接模式都涉及到组合和继承，看上去比较类似不太好区分，但装饰器模式更侧重于在不改变原始类的情况下增加新的功能，而桥接模式则更注重解耦抽象和实现，使得它们可以独立演化，以减少子类的数量。

### 5、外观模式

外观模式（有时也称之为**门面模式**）用于为复杂子系统提供一个简单的高层接口，使得客户端可以更容易地与这些子系统进行交互。

```java
// 子系统类
class SubSystemA {
    public void operationA() {
        System.out.println("SubSystem A: Operation A");
    }
}

class SubSystemB {
    public void operationB() {
        System.out.println("SubSystem B: Operation B");
    }
}

class SubSystemC {
    public void operationC() {
        System.out.println("SubSystem C: Operation C");
    }
}

// 外观类
class Facade {
    private SubSystemA subsystemA;
    private SubSystemB subsystemB;
    private SubSystemC subsystemC;

    public Facade() {
        subsystemA = new SubSystemA();
        subsystemB = new SubSystemB();
        subsystemC = new SubSystemC();
    }

    public void simpleOperation() {
        subsystemA.operationA();
        subsystemB.operationB();
        subsystemC.operationC();
    }
}

// 客户端代码
public class FacadePatternExample {
    public static void main(String[] args) {
        Facade facade = new Facade();
        facade.simpleOperation();
    }
}
```

在这个示例中：

- **子系统类**：`SubSystemA`, `SubSystemB`, 和 `SubSystemC` 是复杂子系统的组成部分，各自提供不同的功能。
- **外观类**：`Facade` 提供了一个简单的方法 `simpleOperation()`，它**封装**了对多个子系统的调用，客户端通过调用外观类的方法来简化与子系统的交互。
- **客户端**：在 `FacadePatternExample` 中，客户端只需与外观类 `Facade` 交互，而不需要直接操作子系统的每个组件。

外观模式对外提供一个统一的行为，可以简化客户端的使用。同时还隐藏了子系统的复杂性，提高了系统的可维护性和可扩展性。

### 6、享元模式（Flyweight 模式）

享元模式（Flyweight Pattern）是一种结构型设计模式，旨在通过共享对象来减少内存使用和提高性能。它通过共享对象来减少内存使用，使得应用程序在运行时可以创建大量相似的对象，而不会造成内存浪费。

```java
// 抽象享元接口
interface Flyweight {
    void operation(String extrinsicState);
}

// 具体享元类
class ConcreteFlyweight implements Flyweight {
    
    // 内部状态，不会随着环境的变化而变化，可以被共享
    private String intrinsicState;

    public ConcreteFlyweight(String intrinsicState) {
        this.intrinsicState = intrinsicState;
    }

    // 外部状态，随着环境的变化而变化，不能被共享，需要在使用时传入
    @Override
    public void operation(String extrinsicState) {
        System.out.println("Intrinsic State: " + intrinsicState + ", Extrinsic State: " + extrinsicState);
    }
}

// 享元工厂
class FlyweightFactory {
    private Map<String, Flyweight> flyweights = new HashMap<>();

    // 获取享元对象，如果不存在则创建一个新的享元对象，并将其放入享元池中，如果已存在则直接返回，以减少内存使用
    public Flyweight getFlyweight(String key) {
        Flyweight flyweight = flyweights.get(key);
        if (flyweight == null) {
            flyweight = new ConcreteFlyweight(key);
            flyweights.put(key, flyweight);
        }
        return flyweight;
    }
}

// 客户端代码
public class Client {
    public static void main(String[] args) {
        FlyweightFactory factory = new FlyweightFactory();

        Flyweight flyweight1 = factory.getFlyweight("A");
        flyweight1.operation("First Call");

        Flyweight flyweight2 = factory.getFlyweight("A");
        flyweight2.operation("Second Call");

        Flyweight flyweight3 = factory.getFlyweight("B");
        flyweight3.operation("Third Call");

        // 检查是否是同一个实例
        System.out.println(flyweight1 == flyweight2); // true，因为它们是同一个享元对象
        System.out.println(flyweight1 == flyweight3); // false，因为它们是不同的享元对象
    }
}
```

“享元”这个词确实很难理解，但其实这是一个翻译问题，源自法语“flyweight”，意为“轻量级”或“蝇量级”，不过直译的话其实也不太好理解。在计算机科学中，享元模式的核心思想是通过共享（元）对象（细粒度对象）来减少内存消耗，这些对象的共享使得系统更轻量。

**关键点：**
- **内在状态（Intrinsic State）：** 享元对象的状态，通常是共享的，不会随环境改变。
- **外在状态（Extrinsic State）：** 依赖于上下文的状态，需要在方法调用时传入，因而不应被享元对象所维护。

享元模式适用于需要大量对象且对象之间存在相似性的场景，通过共享来提高性能。

### 7、代理模式

代理模式允许我们在客户端和真实对象之间创建一个代理层，代理可以控制对真实对象的访问，增加额外的功能（如懒加载、安全控制、日志等）。

```java
// Subject 接口
interface Subject {
    void request();
}

// 真实主题类
class RealSubject implements Subject {
    @Override
    public void request() {
        System.out.println("RealSubject: Handling request.");
    }
}

// 代理类
class Proxy implements Subject {
    private RealSubject realSubject;

    @Override
    public void request() {
        // 可以在请求之前执行一些操作
        System.out.println("Proxy: Pre-processing before real subject request.");

        // 延迟初始化真实主题，在执行此方法时才创建真实主题对象，而且只在需要时创建，以提高性能
        if (realSubject == null) {
            realSubject = new RealSubject();
        }

        // 调用真实主题的请求
        realSubject.request();

        // 可以在请求之后执行一些操作
        System.out.println("Proxy: Post-processing after real subject request.");
    }
}

// 客户端代码
public class ProxyPatternDemo {
    public static void main(String[] args) {
        Subject proxy = new Proxy();
        proxy.request();
    }
}
```

在这个示例中：

1. **Subject 接口**：定义了代理和真实主题共同的接口。
2. **RealSubject**：实现了 Subject 接口，代表了真正的对象。
3. **Proxy**：持有 RealSubject 的引用，控制对 RealSubject 的访问，可以在请求之前或之后添加额外的处理逻辑。
4. **客户端代码**：使用 Proxy 来调用 `request` 方法，而不是直接调用 RealSubject。

代理模式在面向切面编程（AOP）中非常常用，AOP 通过代理模式实现了对方法调用的横切关注点（如日志记录、安全检查、事务管理等）的处理，而不需要修改业务逻辑代码。

代理模式通常可以分为基于类的代理和基于对象的代理，具体区别如下：

#### 1. 基于类的代理（Class-based Proxy）
- **定义**：通过**继承**目标类来创建代理类。代理类会重写目标类的方法，以添加额外的逻辑。
- **使用场景**：通常在**静态代理**中使用。
- **优点**：简单易懂，适用于那些可以通过类继承的情况。
- **缺点**：不够灵活，因为代理类必须与目标类在**编译时绑定**，且无法代理多个类或接口。

#### 2. 基于对象的代理（Object-based Proxy）
- **定义**：通过组合（**持有目标对象的引用**）来实现代理。代理对象**实现**与目标对象相同的接口，方法中调用目标对象的相应方法。
- **使用场景**：通常在动态代理中使用。
- **优点**：更加灵活，可以在运行时决定代理的目标对象，且可以代理多个对象或接口。
- **缺点**：实现相对复杂，特别是在动态代理中需要使用反射等技术。

基于类的代理适合简单情况，但缺乏灵活性；而基于对象的代理提供了更大的灵活性和扩展性，适合复杂应用场景。

我们常用的 JDK 动态代理只能针对实现了接口的类进行代理，因此，如果被代理的类没有实现接口，就无法使用 JDK 动态代理，可以考虑使用 CGLIB 或其他代理库。而 Spring AOP 则是 Spring 框架自带的 AOP 实现，基于 JDK 动态代理和 CGLIB，可以用于简化事务管理等。

## 三、行为型模式

### 1、责任链模式

责任链模式（Chain of Responsibility Pattern）是一种行为型设计模式，它允许将请求沿着处理者链进行传递，直到有一个处理者处理它。这样可以解耦请求的发送者和接收者，从而让多个处理者有机会处理请求。

```java
// 抽象处理者
abstract class Handler {
    protected Handler nextHandler;

    public void setNextHandler(Handler nextHandler) {
        this.nextHandler = nextHandler;
    }

    public abstract void handleRequest(int request);
}

// 具体处理者A
class ConcreteHandlerA extends Handler {
    @Override
    public void handleRequest(int request) {
        if (request < 10) {
            System.out.println("Handler A handling request: " + request);
        } else if (nextHandler != null) {
            nextHandler.handleRequest(request);
        }
    }
}

// 具体处理者B
class ConcreteHandlerB extends Handler {
    @Override
    public void handleRequest(int request) {
        if (request < 20) {
            System.out.println("Handler B handling request: " + request);
        } else if (nextHandler != null) {
            nextHandler.handleRequest(request);
        }
    }
}

// 具体处理者C
class ConcreteHandlerC extends Handler {
    @Override
    public void handleRequest(int request) {
        if (request < 30) {
            System.out.println("Handler C handling request: " + request);
        } else {
            System.out.println("Request " + request + " not handled.");
        }
    }
}

// 测试责任链模式
public class ChainOfResponsibilityExample {
    public static void main(String[] args) {
        // 创建处理者
        Handler handlerA = new ConcreteHandlerA();
        Handler handlerB = new ConcreteHandlerB();
        Handler handlerC = new ConcreteHandlerC();

        // 设置责任链
        handlerA.setNextHandler(handlerB);
        handlerB.setNextHandler(handlerC);

        // 发送请求
        handlerA.handleRequest(5);  // Handler A handling request: 5
        handlerA.handleRequest(15); // Handler B handling request: 15
        handlerA.handleRequest(25); // Handler C handling request: 25
        handlerA.handleRequest(35); // Request 35 not handled.
    }
}
```

在这个示例中：

1. **抽象处理者**：
   - `Handler` 类是一个抽象类，定义了处理请求的方法 `handleRequest` 和设置下一个处理者的方法 `setNextHandler`。

2. **具体处理者**：
   - `ConcreteHandlerA`、`ConcreteHandlerB` 和 `ConcreteHandlerC` 是具体的处理者类，分别实现了请求处理逻辑。
   - 每个处理者会检查请求是否符合自己的处理条件，如果符合则处理请求，否则将请求转发给下一个处理者。

3. **责任链设置**：
   - 在 `main` 方法中创建了多个处理者并设置了它们的责任链。

4. **请求处理**：
   - 调用 `handlerA.handleRequest(request)`，请求会沿着责任链传递，直到找到合适的处理者。

责任链模式提供了一种将请求传递给多个处理者的方式，使得请求的发送者和接收者解耦。它可以灵活地添加或修改处理者，且可以避免多个处理者之间的紧密耦合。

### 2、命令模式

命令模式（Command Pattern）是一种行为型设计模式，它将请求封装为对象，从而使我们可以使用不同的请求、队列或日志请求，并支持可撤销的操作。

```java
// 命令接口
interface Command {
    void execute();
}

// 具体命令A
class ConcreteCommandA implements Command {
    private Receiver receiver;

    public ConcreteCommandA(Receiver receiver) {
        this.receiver = receiver;
    }

    @Override
    public void execute() {
        receiver.actionA();
    }
}

// 具体命令B
class ConcreteCommandB implements Command {
    private Receiver receiver;

    public ConcreteCommandB(Receiver receiver) {
        this.receiver = receiver;
    }

    @Override
    public void execute() {
        receiver.actionB();
    }
}

// 接收者
class Receiver {
    public void actionA() {
        System.out.println("Receiver: Performing action A");
    }

    public void actionB() {
        System.out.println("Receiver: Performing action B");
    }
}

// 调用者
class Invoker {
    private Command command;

    public void setCommand(Command command) {
        this.command = command;
    }

    public void executeCommand() {
        if (command != null) {
            command.execute();
        }
    }
}

// 测试命令模式
public class CommandPatternExample {
    public static void main(String[] args) {
        // 创建接收者
        Receiver receiver = new Receiver();

        // 创建具体命令
        Command commandA = new ConcreteCommandA(receiver);
        Command commandB = new ConcreteCommandB(receiver);

        // 创建调用者
        Invoker invoker = new Invoker();

        // 执行命令A
        invoker.setCommand(commandA);
        invoker.executeCommand(); // Receiver: Performing action A

        // 执行命令B
        invoker.setCommand(commandB);
        invoker.executeCommand(); // Receiver: Performing action B
    }
}
```

在这个示例中：

1. **命令接口**：
   - `Command` 接口定义了一个执行命令的方法 `execute()`。

2. **具体命令**：
   - `ConcreteCommandA` 和 `ConcreteCommandB` 是具体的命令类，它们实现了 `Command` 接口，并持有一个接收者的引用。
   - 在 `execute()` 方法中，它们调用接收者的相应方法。

3. **接收者**：
   - `Receiver` 类包含具体的业务逻辑，负责执行命令的实际操作。

4. **调用者**：
   - `Invoker` 类用于调用命令。它持有一个 `Command` 的引用，并提供 `setCommand` 方法来设置要执行的命令，`executeCommand` 方法执行命令。

5. **测试命令模式**：
   - 在 `main` 方法中，创建接收者、命令和调用者，并通过调用者执行不同的命令。

命令模式通过将请求封装成对象，使得请求的发送者和接收者解耦。它允许您将请求排队、记录请求日志，并支持撤销操作，增加了系统的灵活性和可扩展性。

CQRS（命令查询职责分离）与命令模式有一些相似之处，但它们并不是同一种模式，主要区别有：

#### 1. 概念
- **命令模式**：主要关注将请求封装为对象，从而实现对请求的参数化、排队、日志记录和撤销等功能。命令模式强调如何将请求与执行者解耦。
- **CQRS**：是一种架构模式，将系统的命令（写操作）与查询（读操作）分离，分别处理。这种分离允许在处理读和写时使用不同的模型和技术。

#### 2. 目的
- **命令模式**：主要用于对象行为的封装和管理，提供灵活的请求处理。
- **CQRS**：主要用于提升系统的性能、可扩展性和维护性，特别是在需要处理复杂业务逻辑和高并发场景时。

#### 3. 应用场景
- **命令模式**：适用于需要动态执行不同操作、支持撤销、日志记录等场景。
- **CQRS**：适用于大型应用程序，尤其是复杂领域模型、需要高读写性能或需要分布式架构的系统。

两者都涉及命令的概念，但 CQRS 的范围更广，通常在大型系统中作为一种整体架构风格，而命令模式则是一种具体的设计模式。

这里展开多说一些 CQRS 相关的内容。CQRS 其实就是一种读写分离的架构模式，它将写数据和读数据的过程分开处理，从而各司其职，简化了软件架构。在 CQRS 模式下，写数据的过程通常会遵循领域驱动设计（DDD）的一些原则，以确保业务逻辑的完整性和一致性，而读数据的过程则可以更加灵活，允许开发者根据需求直接从数据库构建数据模型，可能不需要遵循领域模型的复杂性。

CQRS 通常会与 DDD 一起使用，因为 DDD 强调对业务领域的深刻理解，适合处理复杂的业务逻辑，而 CQRS 则提供了一种将复杂的业务逻辑与查询操作分离的方法。这种组合能够有效提高系统的可维护性、可扩展性和灵活性，尤其在面临复杂业务需求和高并发场景时。